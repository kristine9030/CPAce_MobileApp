// AI-generated insight cards for the Performance screen. The student's real
// quiz stats are summarised here and sent to the model, which returns
// render-ready cards — so the screen shows advice grounded in their own
// numbers rather than generic study tips.
const crypto = require('crypto');
const { q, one } = require('../db');
const { complete, parseJsonReply } = require('./aiTutor');
const weakness = require('./weakness');
const streakService = require('./streak');

const TONES = ['positive', 'warning', 'neutral'];
const MAX_CARDS = 4;

// Results are cached per student, keyed by a hash of the summary, so the AI
// only re-runs when the student's performance actually changes.
const cache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const SYSTEM_PROMPT = [
  'You are a CPA board exam review coach inside the CPAce app.',
  'You will be given one student\'s real quiz performance as JSON.',
  'Write 3 to 4 short, specific insight cards about THIS student, using their actual numbers.',
  'Reference concrete topics and figures from the data — never invent a topic or statistic that is not there.',
  'Each card: a short title (max 6 words), a body of one or two sentences, and a tone.',
  'tone is exactly one of: "positive" (a genuine strength), "warning" (something costing them marks), "neutral" (a habit or next step).',
  'Give at least one actionable next step. Be direct and encouraging, never generic.',
  'If the student has very little data, say so plainly and tell them what to do to get a real read.',
  '',
  'Respond with ONLY a JSON object in this exact shape, and no prose around it:',
  '{"insights":[{"title":"...","body":"...","tone":"positive"}]}',
].join('\n');

/** Compact picture of one student's performance, small enough to prompt with. */
async function buildSummary(studentId) {
  const baseWhere = "student_id = ? AND session_type != 'training' AND is_practice_room = 0 AND completed_at IS NOT NULL";

  const totals = await one(
    `SELECT COUNT(*) sessions,
            COALESCE(SUM(total_items),0) attempted,
            COALESCE(SUM(correct_answers),0) correct,
            COALESCE(AVG(score_percent),0) avg_score,
            COALESCE(SUM(duration_secs),0) duration
       FROM quiz_sessions WHERE ${baseWhere}`,
    [studentId]
  );

  const attempted = Number(totals.attempted);
  const correct = Number(totals.correct);

  const topicRows = await q(
    `SELECT t.name AS topic, s.code AS subject_code,
            pr.correct_count, pr.total_attempts, pr.consecutive_wrong
       FROM performance_records pr
       JOIN topics t ON t.id = pr.topic_id
       JOIN subjects s ON s.id = t.subject_id
      WHERE pr.student_id = ? AND pr.total_attempts > 0`,
    [studentId]
  );

  const topics = topicRows.map((r) => {
    const attempts = Number(r.total_attempts);
    const [isWeak] = weakness.evaluate(r);
    return {
      topic: r.topic,
      subject: r.subject_code,
      attempts,
      accuracy: attempts > 0 ? Math.round((Number(r.correct_count) / attempts) * 100) : 0,
      is_weak: isWeak,
    };
  });

  const bySubject = await q(
    `SELECT s.code,
            COALESCE(SUM(pr.correct_count),0) correct,
            COALESCE(SUM(pr.total_attempts),0) attempts
       FROM subjects s
       LEFT JOIN topics t ON t.subject_id = s.id
       LEFT JOIN performance_records pr ON pr.topic_id = t.id AND pr.student_id = ?
      GROUP BY s.id, s.code
      HAVING attempts > 0
      ORDER BY s.id`,
    [studentId]
  );

  return {
    overall_accuracy: attempted > 0 ? Math.round((correct / attempted) * 100) : 0,
    total_sessions: Number(totals.sessions),
    total_questions: attempted,
    average_score: Math.round(Number(totals.avg_score)),
    study_hours: Math.round(Number(totals.duration) / 3600),
    current_streak_days: await streakService.current(studentId),
    weakest_topics: topics.filter((t) => t.is_weak)
      .sort((a, b) => a.accuracy - b.accuracy).slice(0, 6)
      .map(({ is_weak, ...t }) => t),
    strongest_topics: topics.filter((t) => !t.is_weak && t.attempts >= weakness.MIN_ATTEMPTS && t.accuracy >= 75)
      .sort((a, b) => b.accuracy - a.accuracy).slice(0, 5)
      .map(({ is_weak, ...t }) => t),
    by_subject: bySubject.map((r) => ({
      subject: r.code,
      accuracy: Number(r.attempts) > 0 ? Math.round((Number(r.correct) / Number(r.attempts)) * 100) : 0,
      attempts: Number(r.attempts),
    })),
  };
}

function normalize(raw) {
  const list = Array.isArray(raw?.insights) ? raw.insights : Array.isArray(raw) ? raw : [];

  const insights = list
    .map((item) => {
      const title = String(item?.title ?? '').trim();
      const body = String(item?.body ?? '').trim();
      if (!title || !body) return null;

      const tone = String(item?.tone ?? '').trim().toLowerCase();
      return { title, body, tone: TONES.includes(tone) ? tone : 'neutral' };
    })
    .filter(Boolean)
    .slice(0, MAX_CARDS);

  if (insights.length === 0) throw new Error('The AI returned no usable insights.');
  return insights;
}

/**
 * Insight cards for one student. Returns { insights, summary, cached }.
 * `refresh` skips the cache after the student taps Refresh.
 */
async function forStudent(studentId, { refresh = false } = {}) {
  const summary = await buildSummary(studentId);

  // Nothing to analyse yet — answer without spending a model call.
  if (summary.total_sessions === 0) {
    return {
      summary,
      cached: false,
      insights: [{
        title: 'No quiz data yet',
        body: 'Take your first quiz and your personalised insights will appear here — they are built from your own results.',
        tone: 'neutral',
      }],
    };
  }

  const hash = crypto.createHash('md5').update(JSON.stringify(summary)).digest('hex');
  const key = `${studentId}:${hash}`;
  const hit = cache.get(key);

  if (!refresh && hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { insights: hit.insights, summary, cached: true };
  }

  const reply = await complete(SYSTEM_PROMPT, JSON.stringify(summary, null, 2));
  const insights = normalize(parseJsonReply(reply));

  // Only this student's newest hash is worth keeping around.
  for (const existing of cache.keys()) {
    if (existing.startsWith(`${studentId}:`)) cache.delete(existing);
  }
  cache.set(key, { insights, at: Date.now() });

  return { insights, summary, cached: false };
}

module.exports = { forStudent };
