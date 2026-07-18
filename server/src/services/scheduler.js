// Port of App\Services\SpacedRepetitionScheduler (web version) — SM-2.
//   I(1) = 1, I(2) = 6, I(n) = round(I(n-1) x EF)
//   EF' = EF + (0.1 - (5 - q) x (0.08 + (5 - q) x 0.02)), floored at 1.3
//   q < 3 is a lapse: repetition chain resets, review again tomorrow.
const { q: query, one } = require('../db');
const { toSqlDate, addDays, parseSql } = require('../utils/dates');

const EF_MIN = 1.3;
const EF_DEFAULT = 2.5;

function qualityFromAnswer(correct, difficulty) {
  if (correct) {
    if (difficulty === 'difficult') return 3;
    if (difficulty === 'moderate') return 4;
    return 5;
  }
  if (difficulty === 'difficult') return 2;
  if (difficulty === 'moderate') return 1;
  return 0;
}

// state: { repetition_num, ease_factor, interval_days }; reviewedOn: Date
function next(state, quality, reviewedOn) {
  let rep = Number(state.repetition_num) || 0;
  let ef = state.ease_factor != null ? Number(state.ease_factor) : EF_DEFAULT;
  let interval = Number(state.interval_days) || 0;

  ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  ef = Math.max(EF_MIN, Math.round(ef * 100) / 100);

  if (quality < 3) {
    rep = 0;
    interval = 1;
  } else {
    rep++;
    if (rep <= 1) interval = 1;
    else if (rep === 2) interval = 6;
    else interval = Math.max(1, Math.round(interval * ef));
  }

  return {
    repetition_num: rep,
    ease_factor: ef,
    interval_days: interval,
    quality_score: quality,
    last_reviewed: toSqlDate(reviewedOn),
    next_review_at: toSqlDate(addDays(reviewedOn, interval)),
  };
}

// Fast-forward a fresh item through consecutive successful reviews.
function mature(successes, quality = 4) {
  let state = { repetition_num: 0, ease_factor: EF_DEFAULT, interval_days: 0 };
  const anchor = new Date(2000, 0, 1);
  for (let i = 0; i < Math.max(0, successes); i++) {
    state = next(state, quality, anchor);
  }
  return state;
}

// answers: [{ question_id, difficulty, correct }]
async function recordAnswers(studentId, answers, reviewedOn = new Date()) {
  for (const answer of answers) {
    const questionId = Number(answer.question_id);
    const quality = qualityFromAnswer(Boolean(answer.correct), String(answer.difficulty));

    const existing = await one(
      'SELECT * FROM spaced_repetition_items WHERE student_id = ? AND question_id = ?',
      [studentId, questionId]
    );

    const state = next(
      {
        repetition_num: existing ? existing.repetition_num : 0,
        ease_factor: existing ? existing.ease_factor : EF_DEFAULT,
        interval_days: existing ? existing.interval_days : 0,
      },
      quality,
      reviewedOn instanceof Date ? reviewedOn : parseSql(reviewedOn)
    );

    if (existing) {
      await query(
        `UPDATE spaced_repetition_items
            SET repetition_num = ?, ease_factor = ?, interval_days = ?, quality_score = ?, last_reviewed = ?, next_review_at = ?
          WHERE id = ?`,
        [state.repetition_num, state.ease_factor, state.interval_days, state.quality_score, state.last_reviewed, state.next_review_at, existing.id]
      );
    } else {
      await query(
        `INSERT INTO spaced_repetition_items
            (student_id, question_id, repetition_num, ease_factor, interval_days, quality_score, last_reviewed, next_review_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [studentId, questionId, state.repetition_num, state.ease_factor, state.interval_days, state.quality_score, state.last_reviewed, state.next_review_at]
      );
    }
  }
}

module.exports = { EF_MIN, EF_DEFAULT, qualityFromAnswer, next, mature, recordAnswers };
