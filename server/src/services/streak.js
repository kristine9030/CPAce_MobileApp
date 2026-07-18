// Port of App\Services\StreakService (web version).
// Streak = consecutive calendar days ending today (or yesterday if no activity
// yet today) with at least one completed quiz of ANY type.
const { q } = require('../db');
const { toSqlDate, addDays } = require('../utils/dates');

async function streakDates(studentId) {
  const rows = await q(
    'SELECT completed_at FROM quiz_sessions WHERE student_id = ? AND completed_at IS NOT NULL',
    [studentId]
  );

  const active = new Set(rows.map((r) => String(r.completed_at).slice(0, 10)));
  if (active.size === 0) return [];

  let cursor = new Date();
  if (!active.has(toSqlDate(cursor))) cursor = addDays(cursor, -1);

  const dates = [];
  while (active.has(toSqlDate(cursor))) {
    dates.push(toSqlDate(cursor));
    cursor = addDays(cursor, -1);
  }
  return dates;
}

async function current(studentId) {
  return (await streakDates(studentId)).length;
}

async function refresh(studentId) {
  const streak = await current(studentId);
  await q('UPDATE student_profiles SET streak_days = ? WHERE user_id = ?', [streak, studentId]);
  return streak;
}

module.exports = { streakDates, current, refresh };
