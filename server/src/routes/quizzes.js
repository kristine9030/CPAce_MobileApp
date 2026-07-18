// Quiz engine, mirroring the web version's QuizApiController logic
// (question selection, deterministic presentation, grading, performance
// records, points, streaks, SM-2 scheduling, weakness detection) with the
// response shapes the mobile screens expect.
const express = require('express');
const { pool, q, one } = require('../db');
const { apiAuth } = require('../middleware/auth');
const { crc32 } = require('../utils/crc32');
const paraphraser = require('../services/paraphraser');
const weakness = require('../services/weakness');
const streakService = require('../services/streak');
const scheduler = require('../services/scheduler');
const { nowSql, parseSql, toIso } = require('../utils/dates');

const router = express.Router();

const MODES = ['adaptive', 'topic', 'timed', 'challenge'];
const MAX_QUIZ_LENGTH = 100;
const TIMED_SECONDS_PER_QUESTION = 30; // mobile timed sprint: 30s per question
const TIMED_COUNT = 10;
const CHALLENGE_COUNT = 20;
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// ── Question selection (port of selectQuestions on the web) ────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function activeQuestionIds(topicIds, extraWhere = '', extraParams = []) {
  if (!topicIds.length) return [];
  const rows = await q(
    `SELECT id FROM questions WHERE is_active = 1 AND topic_id IN (?) ${extraWhere}`,
    [topicIds, ...extraParams]
  );
  return rows.map((r) => r.id);
}

function fill(ids, poolIds, target) {
  const chosen = ids.slice(0, target);
  if (chosen.length >= target) return chosen;
  const set = new Set(chosen);
  const extra = shuffle(poolIds.filter((id) => !set.has(id))).slice(0, target - chosen.length);
  return chosen.concat(extra);
}

async function pickFocusTopic(topicIds, studentId) {
  if (!topicIds.length) return null;
  const weak = await one(
    `SELECT topic_id FROM performance_records
      WHERE student_id = ? AND topic_id IN (?) AND is_weak_area = 1
      ORDER BY consecutive_wrong DESC LIMIT 1`,
    [studentId, topicIds]
  );
  if (weak) return Number(weak.topic_id);

  const rows = await q(
    `SELECT topic_id, COUNT(*) c FROM questions
      WHERE is_active = 1 AND topic_id IN (?)
      GROUP BY topic_id ORDER BY c DESC`,
    [topicIds]
  );
  if (!rows.length) return topicIds[0];
  const top = rows.filter((r) => Number(r.c) === Number(rows[0].c));
  return Number(top[Math.floor(Math.random() * top.length)].topic_id);
}

async function selectQuestions(mode, topicIds, studentId, count) {
  if (!topicIds.length) return [[], null];

  if (mode === 'topic') {
    const focusTopicId = await pickFocusTopic(topicIds, studentId);
    const ids = shuffle(await activeQuestionIds([focusTopicId])).slice(0, count);
    return [ids, focusTopicId];
  }

  if (mode === 'challenge') {
    const hard = shuffle(await activeQuestionIds(topicIds, "AND difficulty IN ('difficult','moderate')")).slice(0, count);
    return [fill(hard, await activeQuestionIds(topicIds), count), null];
  }

  if (mode === 'adaptive') {
    const weakTopicRows = await q(
      'SELECT topic_id FROM performance_records WHERE student_id = ? AND topic_id IN (?) AND is_weak_area = 1',
      [studentId, topicIds]
    );
    const weakTopicIds = weakTopicRows.map((r) => r.topic_id);
    const weakIds = weakTopicIds.length
      ? shuffle(await activeQuestionIds(weakTopicIds)).slice(0, count)
      : [];
    return [fill(weakIds, await activeQuestionIds(topicIds), count), null];
  }

  // timed / default: random
  return [shuffle(await activeQuestionIds(topicIds)).slice(0, count), null];
}

// ── Presentation (port of presentQuestions on the web) ─────────────────────

async function loadPresentedQuestions(sessionId) {
  const questionIds = (await q('SELECT question_id FROM quiz_answers WHERE session_id = ?', [sessionId])).map((r) => r.question_id);
  if (!questionIds.length) return [];

  const questions = await q('SELECT * FROM questions WHERE id IN (?)', [questionIds]);
  const choices = await q('SELECT * FROM question_choices WHERE question_id IN (?) ORDER BY id', [questionIds]);
  const variants = await q('SELECT * FROM question_variants WHERE question_id IN (?) AND is_active = 1', [questionIds]);

  const choicesByQ = new Map();
  for (const c of choices) {
    if (!choicesByQ.has(c.question_id)) choicesByQ.set(c.question_id, []);
    choicesByQ.get(c.question_id).push(c);
  }
  const variantsByQ = new Map();
  for (const v of variants) {
    if (!variantsByQ.has(v.question_id)) variantsByQ.set(v.question_id, []);
    variantsByQ.get(v.question_id).push(v.variant_text);
  }

  const presented = questions.map((question) => {
    let qChoices = choicesByQ.get(question.id) || [];
    if (question.question_type !== 'true_false') {
      qChoices = [...qChoices].sort(
        (a, b) => crc32(`${sessionId}-${question.id}-${a.id}`) - crc32(`${sessionId}-${question.id}-${b.id}`)
      );
    }

    const displayText = paraphraser.forDisplay(
      question,
      variantsByQ.get(question.id) || [],
      crc32(`${sessionId}-text-${question.id}`)
    );

    return {
      id: question.id,
      topic_id: question.topic_id,
      question_type: question.question_type,
      difficulty: question.difficulty,
      explanation: question.explanation,
      display_text: displayText,
      choices: qChoices.map((c, idx) => ({
        id: c.id,
        letter: LETTERS[idx] || String(idx + 1),
        text: c.choice_text,
        is_correct: Boolean(c.is_correct),
      })),
    };
  });

  presented.sort((a, b) => crc32(`${sessionId}-q-${a.id}`) - crc32(`${sessionId}-q-${b.id}`));
  return presented;
}

async function ownedSession(sessionId, studentId) {
  return one('SELECT * FROM quiz_sessions WHERE id = ? AND student_id = ?', [sessionId, studentId]);
}

function timeLimitMinutes(session, totalItems) {
  if (session.mode !== 'timed') return null;
  return Math.max(1, Math.ceil((totalItems * TIMED_SECONDS_PER_QUESTION) / 60));
}

// ── Routes ─────────────────────────────────────────────────────────────────

router.post('/quizzes/start', apiAuth, async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const body = req.body || {};
    const mode = MODES.includes(body.mode) ? body.mode : 'adaptive';
    const sessionType = ['training', 'testing'].includes(body.session_type) ? body.session_type : 'testing';

    let count = Math.max(1, Math.min(Number(body.num_items ?? body.count) || 10, MAX_QUIZ_LENGTH));
    if (mode === 'timed') count = TIMED_COUNT;
    if (mode === 'challenge') count = CHALLENGE_COUNT;

    let subjectId = body.subject_id != null ? Number(body.subject_id) : null;
    if (subjectId) {
      const subject = await one('SELECT id FROM subjects WHERE id = ? AND is_active = 1', [subjectId]);
      if (!subject) return res.status(422).json({ message: 'Invalid subject.' });
    }
    if (mode === 'topic' && !subjectId) {
      return res.status(422).json({ message: 'Please choose a subject for Topic mode.' });
    }

    const topicRows = subjectId
      ? await q('SELECT id FROM topics WHERE subject_id = ? AND is_active = 1', [subjectId])
      : await q('SELECT id FROM topics WHERE is_active = 1');
    const topicIds = topicRows.map((r) => r.id);

    const [questionIds, focusTopicId] = await selectQuestions(mode, topicIds, studentId, count);
    if (!questionIds.length) {
      return res.status(422).json({ message: 'No questions are available for that subject yet.' });
    }

    const now = nowSql();
    const conn = await pool.getConnection();
    let sessionId;
    try {
      await conn.beginTransaction();
      const [result] = await conn.query(
        `INSERT INTO quiz_sessions (student_id, session_type, mode, subject_id, topic_id, started_at, total_items, correct_answers)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [studentId, sessionType, mode, subjectId, focusTopicId, now, questionIds.length]
      );
      sessionId = result.insertId;
      const values = questionIds.map((qid) => [sessionId, qid, now]);
      await conn.query('INSERT INTO quiz_answers (session_id, question_id, answered_at) VALUES ?', [values]);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    res.status(201).json({
      session_id: sessionId,
      time_limit: mode === 'timed' ? Math.ceil((questionIds.length * TIMED_SECONDS_PER_QUESTION) / 60) : null,
    });
  } catch (err) { next(err); }
});

router.get('/quizzes/history', apiAuth, async (req, res, next) => {
  try {
    const rows = await q(
      `SELECT qs.id, qs.mode, qs.session_type, qs.total_items, qs.correct_answers, qs.score_percent,
              qs.started_at, qs.completed_at, s.code AS subject_code
         FROM quiz_sessions qs
         LEFT JOIN subjects s ON s.id = qs.subject_id
        WHERE qs.student_id = ? AND qs.completed_at IS NOT NULL
        ORDER BY qs.completed_at DESC
        LIMIT 50`,
      [req.user.id]
    );

    res.json({
      sessions: rows.map((r) => ({
        id: r.id,
        mode: r.mode,
        session_type: r.session_type,
        total_items: Number(r.total_items),
        correct_answers: Number(r.correct_answers),
        score_percent: r.score_percent != null ? Number(r.score_percent) : 0,
        started_at: toIso(r.started_at),
        completed_at: toIso(r.completed_at),
        subject_code: r.subject_code,
      })),
    });
  } catch (err) { next(err); }
});

router.get('/quizzes/:id(\\d+)', apiAuth, async (req, res, next) => {
  try {
    const session = await ownedSession(Number(req.params.id), req.user.id);
    if (!session) return res.status(404).json({ message: 'Quiz session not found.' });
    if (session.completed_at) return res.status(422).json({ message: 'This quiz is already completed.' });

    const presented = await loadPresentedQuestions(session.id);

    res.json({
      session_id: session.id,
      mode: session.mode,
      time_limit: timeLimitMinutes(session, presented.length),
      total_items: presented.length,
      questions: presented.map((p, i) => ({
        item_number: i + 1,
        question_id: p.id,
        question_text: p.display_text,
        question_type: p.question_type,
        options: p.choices.map((c) => ({ id: c.id, letter: c.letter, text: c.text })),
      })),
    });
  } catch (err) { next(err); }
});

router.post('/quizzes/:id(\\d+)/submit', apiAuth, async (req, res, next) => {
  try {
    const session = await ownedSession(Number(req.params.id), req.user.id);
    if (!session) return res.status(404).json({ message: 'Quiz session not found.' });
    if (session.completed_at) return res.json({ ok: true, already_completed: true });

    // Mobile sends: { answers: [{ question_id, selected_option_id }] }
    const submittedList = Array.isArray(req.body?.answers) ? req.body.answers : [];
    const selectedByQ = new Map(
      submittedList.map((a) => [Number(a.question_id), a.selected_option_id != null ? Number(a.selected_option_id) : null])
    );

    const questionIds = (await q('SELECT question_id FROM quiz_answers WHERE session_id = ?', [session.id])).map((r) => r.question_id);
    const questions = await q('SELECT * FROM questions WHERE id IN (?)', [questionIds]);
    const choices = await q('SELECT * FROM question_choices WHERE question_id IN (?)', [questionIds]);
    const correctByQ = new Map();
    const choiceOwner = new Map();
    for (const c of choices) {
      choiceOwner.set(c.id, c.question_id);
      if (c.is_correct) correctByQ.set(c.question_id, c.id);
    }

    const now = nowSql();
    let correctCount = 0;
    const topicTally = {};
    const answerResults = [];

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const question of questions) {
        let selected = selectedByQ.get(question.id) ?? null;
        // guard: a selected choice must belong to this question
        if (selected != null && choiceOwner.get(selected) !== question.id) selected = null;
        const isCorrect = selected != null && selected === correctByQ.get(question.id);
        if (isCorrect) correctCount++;

        answerResults.push({ question_id: question.id, difficulty: question.difficulty, correct: isCorrect });

        await conn.query(
          'UPDATE quiz_answers SET selected_choice = ?, is_correct = ?, answered_at = ? WHERE session_id = ? AND question_id = ?',
          [selected, isCorrect ? 1 : 0, now, session.id, question.id]
        );

        if (!topicTally[question.topic_id]) topicTally[question.topic_id] = { attempts: 0, correct: 0 };
        topicTally[question.topic_id].attempts++;
        if (isCorrect) topicTally[question.topic_id].correct++;
      }

      const total = questions.length;
      const scorePercent = total > 0 ? Math.round((correctCount / total) * 10000) / 100 : 0;
      const durationSecs = Math.max(0, Math.round((parseSql(now).getTime() - parseSql(session.started_at).getTime()) / 1000));

      await conn.query(
        'UPDATE quiz_sessions SET completed_at = ?, correct_answers = ?, score_percent = ?, duration_secs = ? WHERE id = ?',
        [now, correctCount, scorePercent, durationSecs, session.id]
      );

      const countsTowardProgress = session.session_type !== 'training';
      if (countsTowardProgress) {
        // performance records (port of updatePerformanceRecords)
        for (const [topicId, tally] of Object.entries(topicTally)) {
          const record = await conn
            .query('SELECT * FROM performance_records WHERE student_id = ? AND topic_id = ?', [session.student_id, topicId])
            .then(([rows]) => rows[0]);
          const wrong = tally.attempts - tally.correct;

          if (record) {
            const totalAttempts = Number(record.total_attempts) + tally.attempts;
            const correctTotal = Number(record.correct_count) + tally.correct;
            const consecutiveWrong = wrong === 0 ? 0 : Number(record.consecutive_wrong) + wrong;
            const [isWeak] = weakness.evaluate({ total_attempts: totalAttempts, correct_count: correctTotal, consecutive_wrong: consecutiveWrong });
            await conn.query(
              'UPDATE performance_records SET total_attempts = ?, correct_count = ?, consecutive_wrong = ?, is_weak_area = ?, last_attempted = ? WHERE id = ?',
              [totalAttempts, correctTotal, consecutiveWrong, isWeak ? 1 : 0, now, record.id]
            );
          } else {
            const [isWeak] = weakness.evaluate({ total_attempts: tally.attempts, correct_count: tally.correct, consecutive_wrong: wrong });
            await conn.query(
              'INSERT INTO performance_records (student_id, topic_id, total_attempts, correct_count, consecutive_wrong, is_weak_area, last_attempted) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [session.student_id, topicId, tally.attempts, tally.correct, wrong, isWeak ? 1 : 0, now]
            );
          }
        }

        // points (port of awardPoints)
        const points = Math.round(correctCount * 10 * (session.mode === 'challenge' ? 1.5 : 1.0));
        if (points > 0) {
          await conn.query(
            "INSERT INTO points_log (student_id, points, reason, created_at) VALUES (?, ?, 'quiz_completed', ?)",
            [session.student_id, points, now]
          );
          await conn.query('UPDATE student_profiles SET total_points = total_points + ? WHERE user_id = ?', [points, session.student_id]);
        }
      }

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    await streakService.refresh(session.student_id);

    if (session.session_type !== 'training') {
      try {
        await scheduler.recordAnswers(session.student_id, answerResults);
        await weakness.syncMany(session.student_id, Object.keys(topicTally));
      } catch (e) {
        console.error('post-submit scheduling failed:', e);
      }
    }

    const fresh = await one('SELECT score_percent FROM quiz_sessions WHERE id = ?', [session.id]);
    res.json({ ok: true, session_id: session.id, score_percent: Number(fresh.score_percent) });
  } catch (err) { next(err); }
});

router.post('/quizzes/:id(\\d+)/cancel', apiAuth, async (req, res, next) => {
  try {
    const session = await ownedSession(Number(req.params.id), req.user.id);
    if (session && !session.completed_at) {
      await q('DELETE FROM quiz_answers WHERE session_id = ?', [session.id]);
      await q('DELETE FROM quiz_sessions WHERE id = ?', [session.id]);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/quizzes/:id(\\d+)/results', apiAuth, async (req, res, next) => {
  try {
    const session = await ownedSession(Number(req.params.id), req.user.id);
    if (!session) return res.status(404).json({ message: 'Quiz session not found.' });
    if (!session.completed_at) return res.status(422).json({ message: 'Quiz not yet completed.' });

    const answers = await q('SELECT * FROM quiz_answers WHERE session_id = ?', [session.id]);
    const answerByQ = new Map(answers.map((a) => [a.question_id, a]));

    const presented = await loadPresentedQuestions(session.id);
    const topicIds = [...new Set(presented.map((p) => p.topic_id))];
    const topicNames = new Map(
      topicIds.length
        ? (await q('SELECT id, name FROM topics WHERE id IN (?)', [topicIds])).map((t) => [t.id, t.name])
        : []
    );

    let correct = 0;
    let skipped = 0;
    const topicMap = new Map();

    const details = presented.map((p, i) => {
      const ans = answerByQ.get(p.id) || {};
      const selected = ans.selected_choice != null ? Number(ans.selected_choice) : null;
      const isCorrect = Boolean(ans.is_correct);
      if (selected == null) skipped++;
      if (isCorrect) correct++;

      const topic = topicNames.get(p.topic_id) || 'General';
      const t = topicMap.get(topic) || { correct: 0, total: 0 };
      t.total++;
      if (isCorrect) t.correct++;
      topicMap.set(topic, t);

      return {
        item_number: i + 1,
        question_text: p.display_text,
        your_answer: selected != null ? (p.choices.find((c) => c.id === selected)?.text ?? null) : null,
        correct_answer: p.choices.find((c) => c.is_correct)?.text ?? '',
        is_correct: isCorrect,
        explanation: p.explanation,
      };
    });

    const total = presented.length;
    const scorePercent = session.score_percent != null ? Number(session.score_percent) : 0;

    let passingThreshold = 75;
    if (session.subject_id) {
      const subject = await one('SELECT passing_threshold FROM subjects WHERE id = ?', [session.subject_id]);
      if (subject) passingThreshold = Number(subject.passing_threshold);
    }

    res.json({
      session_id: session.id,
      mode: session.mode,
      total_items: total,
      correct_answers: correct,
      incorrect_answers: Math.max(0, total - correct - skipped),
      skipped_answers: skipped,
      score_percent: scorePercent,
      points_earned: Math.round(correct * 10 * (session.mode === 'challenge' ? 1.5 : 1.0)),
      time_taken_seconds: Number(session.duration_secs) || 0,
      passed: scorePercent >= passingThreshold,
      by_topic: Array.from(topicMap, ([topic, t]) => ({
        topic,
        correct: t.correct,
        total: t.total,
        accuracy: t.total > 0 ? t.correct / t.total : 0,
      })),
      question_details: details,
    });
  } catch (err) { next(err); }
});

module.exports = { router };
