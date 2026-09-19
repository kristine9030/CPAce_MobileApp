// Live Room rival parameters for Ranked-mode quizzes — a port of the web
// app's RivalTierService.
//
// The "intelligence" of each rival is two things:
//   1. Its starting pace/accuracy (spq/acc below) — data-derived once enough
//      history exists, otherwise the original hand-picked fallback tiers.
//   2. Its live adaptation to the student's own pace, which happens entirely
//      on the client (see app/lib/liveRoom.ts) since it reacts to the
//      student's own timing during the quiz, not anything server-side.
//
// Only Ranked-mode sessions (is_practice_room = false) ever feed or use
// this — Practice Room sessions use student-picked difficulty labels
// instead (see PRACTICE_TIERS in routes/quizzes.js) and are never part of
// this computation.
const { q, one } = require('../db');

const MIN_SESSIONS_PER_STUDENT = 3;
// A percentage rather than a fixed headcount, so a small install (a single
// school, a few dozen students) can still reach it.
const MIN_QUALIFYING_RATIO = 0.5;
const MIN_QUALIFYING_FLOOR = 10;
// Top performers = this percentile and above, by average accuracy. Kept
// wide because a small qualifying pool would otherwise average only 2-3
// students, which is too noisy to anchor a rival's pace on.
const TOP_PERCENTILE = 0.60;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// The hand-picked fallback tiers, used until there's enough historical data
// to compute real ones. These are the original values the Live Room shipped
// with on the web.
const FALLBACK_TIERS = [
  { name: 'Aria', tag: 'Speedster',  color: '#ef4444', spq: 13, acc: 0.81 },
  { name: 'Dex',  tag: 'Risk-taker', color: '#f59e0b', spq: 15, acc: 0.78 },
  { name: 'Mira', tag: 'Methodical', color: '#3b82f6', spq: 24, acc: 0.93 },
  { name: 'Kip',  tag: 'Steady',     color: '#10b981', spq: 19, acc: 0.87 },
  { name: 'Nova', tag: 'Clutch',     color: '#8b5cf6', spq: 17, acc: 0.90 },
  { name: 'Rio',  tag: 'Grinder',    color: '#0ea5e9', spq: 21, acc: 0.85 },
  { name: 'Sage', tag: 'Precise',    color: '#14b8a6', spq: 26, acc: 0.95 },
  { name: 'Zed',  tag: 'Sprinter',   color: '#e11d48', spq: 11, acc: 0.76 },
];

const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const round = (n, dp) => Math.round(n * 10 ** dp) / 10 ** dp;

let cache = null; // { at: number, tiers: array }

async function activeStudentCount() {
  const row = await one("SELECT COUNT(*) c FROM users WHERE role_id = 2 AND is_active = 1");
  return Number(row?.c || 0);
}

async function deriveFromHistory() {
  const perStudent = await q(`
    SELECT student_id,
           COUNT(*) AS sessions,
           AVG(duration_secs / total_items) AS avg_spq,
           AVG(correct_answers / total_items) AS avg_acc
      FROM quiz_sessions
     WHERE session_type != 'training'
       AND is_practice_room = 0
       AND completed_at IS NOT NULL
       AND total_items > 0
     GROUP BY student_id
    HAVING COUNT(*) >= ?
  `, [MIN_SESSIONS_PER_STUDENT]);

  const requiredQualifying = Math.max(
    MIN_QUALIFYING_FLOOR,
    Math.ceil((await activeStudentCount()) * MIN_QUALIFYING_RATIO)
  );
  if (perStudent.length < requiredQualifying) return null;

  // Keep the top percentile by accuracy — these are the students whose
  // pace/accuracy the rivals should model.
  const sorted = [...perStudent].sort((a, b) => Number(b.avg_acc) - Number(a.avg_acc));
  const cutIndex = Math.floor(perStudent.length * (1 - TOP_PERCENTILE));
  const topPerformers = sorted.slice(0, Math.max(1, perStudent.length - cutIndex));

  const baseSpq = avg(topPerformers.map((r) => Number(r.avg_spq)));
  const baseAcc = avg(topPerformers.map((r) => Number(r.avg_acc)));

  // Spread the single top-performer baseline across the existing named
  // tiers using the same relative offsets the fallback pool used, so the
  // rival "personalities" (Speedster vs. Methodical, etc.) keep their
  // character instead of collapsing into one identical rival.
  const fallbackAvgSpq = avg(FALLBACK_TIERS.map((t) => t.spq));
  const fallbackAvgAcc = avg(FALLBACK_TIERS.map((t) => t.acc));

  return FALLBACK_TIERS.map((tier) => ({
    name: tier.name,
    tag: tier.tag,
    color: tier.color,
    spq: round(baseSpq * (tier.spq / fallbackAvgSpq), 1),
    acc: round(Math.min(0.97, Math.max(0.5, baseAcc + (tier.acc - fallbackAvgAcc))), 2),
  }));
}

/**
 * The rival pool for Ranked mode: data-derived once enough history exists,
 * otherwise the fallback tiers above. Cached because this scans historical
 * sessions and only needs to move as the student body's performance shifts
 * over days/weeks, not within a single quiz.
 */
async function tiers() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.tiers;
  const derived = await deriveFromHistory();
  const result = derived ?? FALLBACK_TIERS;
  cache = { at: Date.now(), tiers: result };
  return result;
}

module.exports = { tiers, FALLBACK_TIERS };
