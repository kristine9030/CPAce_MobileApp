// Port of App\Services\WeaknessDetector (web version).
// A topic is weak when accuracy < 60% over >= 5 attempts, or 3 wrong in a row.
const { q, one } = require('../db');
const { nowSql } = require('../utils/dates');

const ACCURACY_THRESHOLD = 0.6;
const MIN_ATTEMPTS = 5;
const CONSECUTIVE_WRONG = 3;

// record: { total_attempts, correct_count, consecutive_wrong }
function evaluate(record) {
  const attempts = Number(record.total_attempts) || 0;
  const correct = Number(record.correct_count) || 0;
  const wrongRun = Number(record.consecutive_wrong) || 0;
  const accuracy = attempts > 0 ? correct / attempts : 0;

  if (wrongRun >= CONSECUTIVE_WRONG) return [true, 'consecutive_wrong', accuracy];
  if (attempts >= MIN_ATTEMPTS && accuracy < ACCURACY_THRESHOLD) return [true, 'low_accuracy', accuracy];
  return [false, null, accuracy];
}

// Reconcile weakness_reports for one (student, topic). Idempotent.
async function sync(studentId, topicId) {
  const record = await one(
    'SELECT * FROM performance_records WHERE student_id = ? AND topic_id = ?',
    [studentId, topicId]
  );
  if (!record) return;

  const [isWeak, reason, accuracy] = evaluate(record);

  const open = await one(
    'SELECT id FROM weakness_reports WHERE student_id = ? AND topic_id = ? AND resolved_at IS NULL',
    [studentId, topicId]
  );

  if (isWeak && !open) {
    await q(
      'INSERT INTO weakness_reports (student_id, topic_id, flagged_at, trigger_reason, accuracy_at_flag) VALUES (?, ?, ?, ?, ?)',
      [studentId, topicId, nowSql(), reason, Math.round(accuracy * 10000) / 100]
    );
  } else if (!isWeak && open) {
    await q('UPDATE weakness_reports SET resolved_at = ? WHERE id = ?', [nowSql(), open.id]);
  }
}

async function syncMany(studentId, topicIds) {
  for (const topicId of topicIds) {
    await sync(studentId, Number(topicId));
  }
}

module.exports = { evaluate, sync, syncMany, ACCURACY_THRESHOLD, MIN_ATTEMPTS, CONSECUTIVE_WRONG };
