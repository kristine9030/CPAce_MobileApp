// Student side of faculty-authored class quizzes, mirroring the web version's
// ClassQuizController. A class quiz is a fixed set of questions the faculty
// assembles and shares by token — unlike the adaptive engine, which draws
// random Test Bank questions per student.
const express = require('express');
const { q, one } = require('../db');
const { apiAuth } = require('../middleware/auth');
const { crc32 } = require('../utils/crc32');
const { nowSql, parseSql, toIso, fmtDay } = require('../utils/dates');

const router = express.Router();

const STUDENT_ROLE = 2;

function isStudent(user) {
  return Number(user.role_id) === STUDENT_ROLE;
}

/** Choices are stored as a JSON string in faculty_quiz_items.choices. */
function parseChoices(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseAnswers(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function correctLabel(choices) {
  const hit = choices.find((c) => c && (c.is_correct === true || c.is_correct === 1));
  return hit ? String(hit.label) : null;
}

/**
 * draft | closed | upcoming | expired | open — same ladder as the web
 * FacultyQuiz::availability(), so both clients agree on what a student sees.
 */
function availability(quiz) {
  if (quiz.status === 'closed') return 'closed';
  if (quiz.status !== 'published') return 'draft';

  const now = new Date();
  if (quiz.opens_at && parseSql(quiz.opens_at) > now) return 'upcoming';
  if (quiz.due_at && parseSql(quiz.due_at) < now) return 'expired';
  return 'open';
}

function unavailableMessage(quiz) {
  switch (availability(quiz)) {
    case 'upcoming': return `This quiz opens on ${fmtDay(quiz.opens_at)}.`;
    case 'expired':  return 'The deadline for this quiz has passed.';
    case 'closed':   return 'This quiz has been closed by your instructor.';
    default:         return 'This quiz is not available right now.';
  }
}

/**
 * Seconds left for one attempt: the per-attempt time limit and the quiz
 * deadline both apply, whichever runs out first. null means untimed.
 */
function secondsLeft(quiz, attempt) {
  const limits = [];

  if (quiz.time_limit_minutes) {
    const deadline = parseSql(attempt.started_at).getTime() + quiz.time_limit_minutes * 60_000;
    limits.push(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
  }
  if (quiz.due_at) {
    limits.push(Math.max(0, Math.round((parseSql(quiz.due_at).getTime() - Date.now()) / 1000)));
  }

  return limits.length ? Math.min(...limits) : null;
}

/**
 * Question order for one attempt. Shuffled quizzes use a deterministic order
 * keyed on the attempt id, so the take screen and the result screen always
 * list the questions the same way.
 */
function orderedItems(items, quiz, attempt) {
  if (!quiz.shuffle_questions) return items;
  return [...items].sort((a, b) => crc32(`${attempt.id}-${a.id}`) - crc32(`${attempt.id}-${b.id}`));
}

async function quizByToken(token) {
  return one('SELECT * FROM faculty_quizzes WHERE share_token = ?', [String(token)]);
}

async function itemsFor(quizId) {
  const rows = await q(
    'SELECT * FROM faculty_quiz_items WHERE quiz_id = ? ORDER BY sort_order, id',
    [quizId]
  );
  return rows.map((r) => ({ ...r, choices: parseChoices(r.choices) }));
}

async function attemptFor(quizId, studentId) {
  return one(
    'SELECT * FROM faculty_quiz_attempts WHERE quiz_id = ? AND student_id = ?',
    [quizId, studentId]
  );
}

function presentQuiz(quiz, extra = {}) {
  return {
    id: quiz.id,
    token: quiz.share_token,
    title: quiz.title,
    instructions: quiz.instructions,
    status: quiz.status,
    availability: availability(quiz),
    opens_at: toIso(quiz.opens_at),
    due_at: toIso(quiz.due_at),
    due_on: quiz.due_at ? fmtDay(quiz.due_at) : null,
    time_limit_minutes: quiz.time_limit_minutes ?? null,
    show_results: Boolean(quiz.show_results),
    subject_code: quiz.subject_code ?? null,
    subject_name: quiz.subject_name ?? null,
    faculty_name: quiz.faculty_name ?? null,
    ...extra,
  };
}

function presentAttempt(attempt) {
  if (!attempt) return null;
  return {
    id: attempt.id,
    started_at: toIso(attempt.started_at),
    submitted_at: toIso(attempt.submitted_at),
    submitted: attempt.submitted_at !== null,
    score: Number(attempt.score) || 0,
    total_points: Number(attempt.total_points) || 0,
    percent: attempt.percent === null ? null : Number(attempt.percent),
  };
}

// ── GET /class-quizzes — every published/closed quiz + this student's attempt ─
router.get('/class-quizzes', apiAuth, async (req, res, next) => {
  try {
    if (!isStudent(req.user)) return res.status(403).json({ message: 'Only students can take class quizzes.' });

    const rows = await q(
      `SELECT fq.*,
              s.code AS subject_code, s.name AS subject_name,
              CONCAT(u.first_name, ' ', u.last_name) AS faculty_name,
              (SELECT COUNT(*) FROM faculty_quiz_items i WHERE i.quiz_id = fq.id) items_count
         FROM faculty_quizzes fq
         LEFT JOIN subjects s ON s.id = fq.subject_id
         LEFT JOIN users u ON u.id = fq.faculty_id
        WHERE fq.status IN ('published', 'closed')
        ORDER BY fq.due_at IS NULL, fq.due_at`,
      []
    );

    const attempts = rows.length
      ? await q(
          `SELECT * FROM faculty_quiz_attempts
            WHERE student_id = ? AND quiz_id IN (${rows.map(() => '?').join(',')})`,
          [req.user.id, ...rows.map((r) => r.id)]
        )
      : [];
    const byQuiz = new Map(attempts.map((a) => [Number(a.quiz_id), a]));

    const quizzes = rows.map((row) => {
      const attempt = byQuiz.get(Number(row.id)) || null;
      return presentQuiz(row, {
        items_count: Number(row.items_count),
        attempt: presentAttempt(attempt),
      });
    });

    // Open quizzes the student hasn't finished float to the top, then finished
    // ones, then everything that's closed or expired.
    const rank = (x) => {
      if (x.availability === 'open' && !x.attempt?.submitted) return 0;
      return x.attempt?.submitted ? 1 : 2;
    };
    quizzes.sort((a, b) => rank(a) - rank(b));

    res.json({ quizzes });
  } catch (err) { next(err); }
});

// ── GET /class-quizzes/:token — landing page: what it is, when it's due ──────
router.get('/class-quizzes/:token', apiAuth, async (req, res, next) => {
  try {
    if (!isStudent(req.user)) return res.status(403).json({ message: 'Only students can take class quizzes.' });

    const quiz = await quizByToken(req.params.token);
    if (!quiz || quiz.status === 'draft') return res.status(404).json({ message: 'Quiz not found.' });

    const meta = await one(
      `SELECT s.code AS subject_code, s.name AS subject_name,
              CONCAT(u.first_name, ' ', u.last_name) AS faculty_name,
              (SELECT COUNT(*) FROM faculty_quiz_items i WHERE i.quiz_id = ?) items_count,
              (SELECT COALESCE(SUM(i.points),0) FROM faculty_quiz_items i WHERE i.quiz_id = ?) total_points
         FROM faculty_quizzes fq
         LEFT JOIN subjects s ON s.id = fq.subject_id
         LEFT JOIN users u ON u.id = fq.faculty_id
        WHERE fq.id = ?`,
      [quiz.id, quiz.id, quiz.id]
    );

    const attempt = await attemptFor(quiz.id, req.user.id);

    res.json({
      quiz: presentQuiz({ ...quiz, ...meta }, {
        items_count: Number(meta?.items_count ?? 0),
        total_points: Number(meta?.total_points ?? 0),
      }),
      attempt: presentAttempt(attempt),
      can_start: availability(quiz) === 'open' && !(attempt && attempt.submitted_at),
      unavailable_message: availability(quiz) === 'open' ? null : unavailableMessage(quiz),
    });
  } catch (err) { next(err); }
});

// ── POST /class-quizzes/:token/start — open (or resume) the attempt ──────────
router.post('/class-quizzes/:token/start', apiAuth, async (req, res, next) => {
  try {
    if (!isStudent(req.user)) return res.status(403).json({ message: 'Only students can take class quizzes.' });

    const quiz = await quizByToken(req.params.token);
    if (!quiz || quiz.status === 'draft') return res.status(404).json({ message: 'Quiz not found.' });

    let attempt = await attemptFor(quiz.id, req.user.id);
    if (attempt && attempt.submitted_at) {
      return res.status(409).json({ message: 'You have already submitted this quiz.', submitted: true });
    }
    if (availability(quiz) !== 'open') {
      return res.status(422).json({ message: unavailableMessage(quiz) });
    }

    if (!attempt) {
      const now = nowSql();
      const result = await q(
        'INSERT INTO faculty_quiz_attempts (quiz_id, student_id, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [quiz.id, req.user.id, now, now, now]
      );
      attempt = await one('SELECT * FROM faculty_quiz_attempts WHERE id = ?', [result.insertId]);
    }

    res.json({ ok: true, attempt: presentAttempt(attempt) });
  } catch (err) { next(err); }
});

// ── GET /class-quizzes/:token/take — the questions, without the answer key ───
router.get('/class-quizzes/:token/take', apiAuth, async (req, res, next) => {
  try {
    if (!isStudent(req.user)) return res.status(403).json({ message: 'Only students can take class quizzes.' });

    const quiz = await quizByToken(req.params.token);
    if (!quiz || quiz.status === 'draft') return res.status(404).json({ message: 'Quiz not found.' });

    const attempt = await attemptFor(quiz.id, req.user.id);
    if (!attempt) return res.status(404).json({ message: 'Start the quiz first.' });
    if (attempt.submitted_at) return res.status(409).json({ message: 'You have already submitted this quiz.', submitted: true });
    if (quiz.status !== 'published') {
      return res.status(422).json({ message: 'This quiz has been closed by your instructor.' });
    }

    const items = orderedItems(await itemsFor(quiz.id), quiz, attempt);

    res.json({
      quiz: presentQuiz(quiz),
      attempt: presentAttempt(attempt),
      seconds_left: secondsLeft(quiz, attempt),
      // is_correct is deliberately stripped — the client never sees the key
      // before submitting.
      items: items.map((item) => ({
        id: item.id,
        question_text: item.question_text,
        question_type: item.question_type,
        points: Number(item.points) || 1,
        choices: item.choices.map((c) => ({ label: String(c.label), text: String(c.text ?? '') })),
      })),
    });
  } catch (err) { next(err); }
});

// ── POST /class-quizzes/:token/submit — score and freeze the attempt ─────────
router.post('/class-quizzes/:token/submit', apiAuth, async (req, res, next) => {
  try {
    if (!isStudent(req.user)) return res.status(403).json({ message: 'Only students can take class quizzes.' });

    const quiz = await quizByToken(req.params.token);
    if (!quiz || quiz.status === 'draft') return res.status(404).json({ message: 'Quiz not found.' });

    const attempt = await attemptFor(quiz.id, req.user.id);
    if (!attempt) return res.status(404).json({ message: 'Start the quiz first.' });
    if (attempt.submitted_at) return res.status(409).json({ message: 'You have already submitted this quiz.', submitted: true });

    const submitted = req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
    const items = await itemsFor(quiz.id);

    // Score server-side against the stored key; anything the client sends that
    // isn't a real choice label on that item is ignored rather than trusted.
    const answers = {};
    let score = 0;
    let total = 0;

    for (const item of items) {
      const points = Number(item.points) || 1;
      total += points;

      const raw = submitted[item.id] ?? submitted[String(item.id)];
      const picked = raw == null ? '' : String(raw).trim().toUpperCase();
      const valid = item.choices.map((c) => String(c.label).toUpperCase());
      if (!picked || !valid.includes(picked)) continue;

      answers[item.id] = picked;
      if (picked === String(correctLabel(item.choices) ?? '').toUpperCase()) score += points;
    }

    const percent = total > 0 ? Math.round((score / total) * 10000) / 100 : 0;

    await q(
      `UPDATE faculty_quiz_attempts
          SET answers = ?, score = ?, total_points = ?, percent = ?, submitted_at = ?, updated_at = ?
        WHERE id = ?`,
      [JSON.stringify(answers), score, total, percent, nowSql(), nowSql(), attempt.id]
    );

    res.json({ ok: true, score, total_points: total, percent });
  } catch (err) { next(err); }
});

// ── GET /class-quizzes/:token/result — the graded attempt ────────────────────
router.get('/class-quizzes/:token/result', apiAuth, async (req, res, next) => {
  try {
    if (!isStudent(req.user)) return res.status(403).json({ message: 'Only students can take class quizzes.' });

    const quiz = await quizByToken(req.params.token);
    if (!quiz || quiz.status === 'draft') return res.status(404).json({ message: 'Quiz not found.' });

    const attempt = await attemptFor(quiz.id, req.user.id);
    if (!attempt || !attempt.submitted_at) {
      return res.status(404).json({ message: 'You have not submitted this quiz yet.' });
    }

    const meta = await one(
      `SELECT s.code AS subject_code, s.name AS subject_name,
              CONCAT(u.first_name, ' ', u.last_name) AS faculty_name
         FROM faculty_quizzes fq
         LEFT JOIN subjects s ON s.id = fq.subject_id
         LEFT JOIN users u ON u.id = fq.faculty_id
        WHERE fq.id = ?`,
      [quiz.id]
    );

    const picked = parseAnswers(attempt.answers);

    // When the faculty turned results off, the student still sees their score
    // but not the per-question breakdown.
    const items = quiz.show_results
      ? orderedItems(await itemsFor(quiz.id), quiz, attempt).map((item) => {
          const mine = picked[item.id] ?? picked[String(item.id)] ?? null;
          const correct = correctLabel(item.choices);
          return {
            id: item.id,
            question_text: item.question_text,
            points: Number(item.points) || 1,
            choices: item.choices.map((c) => ({ label: String(c.label), text: String(c.text ?? '') })),
            selected_label: mine,
            correct_label: correct,
            is_correct: mine !== null && String(mine).toUpperCase() === String(correct ?? '').toUpperCase(),
            explanation: item.explanation ?? null,
          };
        })
      : [];

    res.json({
      quiz: presentQuiz({ ...quiz, ...meta }),
      attempt: presentAttempt(attempt),
      items,
    });
  } catch (err) { next(err); }
});

module.exports = { router };
