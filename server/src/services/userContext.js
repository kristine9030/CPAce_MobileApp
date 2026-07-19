// Builds a compact, real snapshot of a student's account/performance/notes
// from cpace_db so the AI Tutor can answer questions about "my" progress
// accurately instead of guessing. Read-only — never mutates data.
const { q, one } = require('../db');
const streakService = require('./streak');
const weakness = require('./weakness');
const { startOfDay, parseSql } = require('../utils/dates');

async function getContext(studentId) {
  const user = await one('SELECT first_name, last_name, exam_target_date FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id WHERE u.id = ?', [studentId]);
  const profile = await one('SELECT * FROM student_profiles WHERE user_id = ?', [studentId]);
  const streak = await streakService.current(studentId);

  const examDate = profile?.exam_target_date ?? null;
  const daysToExam = examDate
    ? Math.max(0, Math.ceil((startOfDay(parseSql(examDate)).getTime() - startOfDay(new Date()).getTime()) / 86400000))
    : null;

  const baseWhere = "student_id = ? AND session_type != 'training' AND completed_at IS NOT NULL";
  const totals = await one(
    `SELECT COUNT(*) sessions, COALESCE(SUM(total_items),0) attempted,
            COALESCE(SUM(correct_answers),0) correct, COALESCE(AVG(score_percent),0) avg_score
       FROM quiz_sessions WHERE ${baseWhere}`,
    [studentId]
  );
  const attempted = Number(totals.attempted);
  const overallAccuracy = attempted > 0 ? Math.round((Number(totals.correct) / attempted) * 100) : 0;

  const subjectMastery = (await q(
    `SELECT s.code, s.name,
            COALESCE(SUM(pr.correct_count),0) correct,
            COALESCE(SUM(pr.total_attempts),0) attempts
       FROM subjects s
       LEFT JOIN topics t ON t.subject_id = s.id
       LEFT JOIN performance_records pr ON pr.topic_id = t.id AND pr.student_id = ?
      GROUP BY s.id, s.code, s.name
      ORDER BY s.id`,
    [studentId]
  )).map((r) => ({
    code: r.code,
    name: r.name,
    mastery: Number(r.attempts) > 0 ? Math.round((Number(r.correct) / Number(r.attempts)) * 100) : 0,
    attempts: Number(r.attempts),
  }));

  const topicStats = (await q(
    `SELECT t.name AS topic, s.code AS subject_code,
            pr.correct_count, pr.total_attempts, pr.consecutive_wrong
       FROM performance_records pr
       JOIN topics t ON t.id = pr.topic_id
       JOIN subjects s ON s.id = t.subject_id
      WHERE pr.student_id = ? AND pr.total_attempts > 0`,
    [studentId]
  )).map((r) => {
    const [isWeak] = weakness.evaluate(r);
    const attemptsCount = Number(r.total_attempts);
    return {
      topic: r.topic,
      subject_code: r.subject_code,
      attempts: attemptsCount,
      accuracy: attemptsCount > 0 ? Math.round((Number(r.correct_count) / attemptsCount) * 100) : 0,
      is_weak: isWeak,
    };
  });

  const weaknesses = topicStats.filter((t) => t.is_weak).sort((a, b) => a.accuracy - b.accuracy).slice(0, 5);
  const strengths = topicStats.filter((t) => !t.is_weak && t.accuracy >= 75).sort((a, b) => b.accuracy - a.accuracy).slice(0, 5);

  const recentSessions = (await q(
    `SELECT qs.mode, qs.total_items, qs.correct_answers, qs.score_percent, qs.completed_at, s.code AS subject_code
       FROM quiz_sessions qs
       LEFT JOIN subjects s ON s.id = qs.subject_id
      WHERE qs.student_id = ? AND qs.session_type != 'training' AND qs.completed_at IS NOT NULL
      ORDER BY qs.completed_at DESC
      LIMIT 5`,
    [studentId]
  )).map((r) => ({
    mode: r.mode,
    subject_code: r.subject_code,
    score_percent: r.score_percent != null ? Number(r.score_percent) : null,
    completed_at: String(r.completed_at).slice(0, 10),
  }));

  const notes = (await q(
    `SELECT rn.title, rn.content, rn.tags, rn.is_favorite, rn.created_at, s.code AS subject_code
       FROM review_notes rn
       LEFT JOIN subjects s ON s.id = rn.subject_id
      WHERE rn.student_id = ?
      ORDER BY rn.created_at DESC
      LIMIT 15`,
    [studentId]
  )).map((n) => ({
    title: n.title,
    subject_code: n.subject_code,
    tags: n.tags,
    is_favorite: Boolean(n.is_favorite),
    excerpt: n.content ? String(n.content).slice(0, 300) : null,
  }));

  return {
    name: `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim(),
    streak_days: streak,
    total_points: Number(profile?.total_points ?? 0),
    exam_target_date: examDate,
    days_to_exam: daysToExam,
    overall_accuracy: overallAccuracy,
    total_sessions: Number(totals.sessions),
    total_questions_attempted: attempted,
    average_score: Math.round(Number(totals.avg_score)),
    subject_mastery: subjectMastery,
    weaknesses,
    strengths,
    recent_sessions: recentSessions,
    notes_count: notes.length,
    notes,
  };
}

function formatForPrompt(ctx) {
  const lines = [
    'STUDENT ACCOUNT DATA (from the live database — treat as ground truth, do not contradict it):',
    `Name: ${ctx.name || 'Unknown'}`,
    `Current streak: ${ctx.streak_days} day(s)`,
    `Total points: ${ctx.total_points}`,
    `Exam target date: ${ctx.exam_target_date ?? 'not set'}${ctx.days_to_exam != null ? ` (${ctx.days_to_exam} day(s) away)` : ''}`,
    `Overall quiz accuracy: ${ctx.overall_accuracy}% across ${ctx.total_sessions} completed quiz session(s), ${ctx.total_questions_attempted} question(s) attempted, average score ${ctx.average_score}%.`,
  ];

  if (ctx.subject_mastery?.length) {
    lines.push('Subject mastery: ' + ctx.subject_mastery
      .map((s) => `${s.code} ${s.mastery}%${s.attempts === 0 ? ' (no attempts yet)' : ''}`)
      .join(', '));
  }

  if (ctx.weaknesses?.length) {
    lines.push('Weakest topics: ' + ctx.weaknesses.map((w) => `${w.topic} (${w.subject_code}, ${w.accuracy}% accuracy)`).join(', '));
  } else {
    lines.push('Weakest topics: none flagged yet.');
  }

  if (ctx.strengths?.length) {
    lines.push('Strongest topics: ' + ctx.strengths.map((s) => `${s.topic} (${s.subject_code}, ${s.accuracy}% accuracy)`).join(', '));
  }

  if (ctx.recent_sessions?.length) {
    lines.push('Recent quiz sessions: ' + ctx.recent_sessions
      .map((s) => `${s.completed_at} ${s.subject_code ?? 'mixed'} ${s.mode} — ${s.score_percent}%`)
      .join('; '));
  } else {
    lines.push('Recent quiz sessions: none yet.');
  }

  if (ctx.notes?.length) {
    lines.push(`Review notes (${ctx.notes_count} total, most recent first):`);
    ctx.notes.forEach((n) => {
      lines.push(`- "${n.title}"${n.subject_code ? ` [${n.subject_code}]` : ''}${n.is_favorite ? ' ★' : ''}: ${n.excerpt ?? '(no content)'}`);
    });
  } else {
    lines.push('Review notes: the student has not written any notes yet.');
  }

  lines.push('Use this data only when the student asks about their own account, progress, performance, or notes. For general CPA-subject questions, answer normally and ignore this block.');

  return lines.join('\n');
}

module.exports = { getContext, formatForPrompt };
