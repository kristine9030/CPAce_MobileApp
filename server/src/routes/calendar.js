// Spaced-repetition study calendar, mirroring the web version's
// CalendarApiController (SM-2 schedule seeding + weakness sync) shaped for the
// mobile calendar screen: ?year=YYYY&month=M.
const express = require('express');
const { pool, q } = require('../db');
const { apiAuth } = require('../middleware/auth');
const weakness = require('../services/weakness');
const scheduler = require('../services/scheduler');
const { toSqlDate, addDays, parseSql, startOfDay, MONTHS } = require('../utils/dates');

const router = express.Router();

// Port of ensureSchedule: sync weakness flags, then seed spaced_repetition_items
// from historical performance if the student has none yet.
async function ensureSchedule(studentId) {
  const records = await q(
    'SELECT * FROM performance_records WHERE student_id = ? AND total_attempts > 0',
    [studentId]
  );

  for (const record of records) {
    await weakness.sync(studentId, Number(record.topic_id));
  }

  const existing = await q('SELECT id FROM spaced_repetition_items WHERE student_id = ? LIMIT 1', [studentId]);
  if (existing.length || !records.length) return;

  const rows = [];
  for (const record of records) {
    const accuracy = Number(record.correct_count) / Math.max(Number(record.total_attempts), 1);
    const reviewedOn = record.last_attempted ? parseSql(record.last_attempted) : new Date();
    const questions = await q(
      'SELECT id, difficulty FROM questions WHERE topic_id = ? AND is_active = 1 ORDER BY id',
      [record.topic_id]
    );
    if (!questions.length) continue;

    const rememberCount = Math.round(accuracy * questions.length);
    questions.forEach((question, i) => {
      const state = i < rememberCount
        ? scheduler.mature(1 + (i % 4), scheduler.qualityFromAnswer(true, question.difficulty))
        : scheduler.next(
            { repetition_num: 0, ease_factor: scheduler.EF_DEFAULT, interval_days: 0 },
            scheduler.qualityFromAnswer(false, question.difficulty),
            reviewedOn
          );

      const interval = Number(state.interval_days);
      rows.push([
        studentId,
        question.id,
        state.repetition_num,
        state.ease_factor,
        interval,
        state.quality_score ?? null,
        toSqlDate(reviewedOn),
        toSqlDate(addDays(reviewedOn, interval)),
      ]);
    });
  }

  for (let i = 0; i < rows.length; i += 200) {
    await pool.query(
      'INSERT INTO spaced_repetition_items (student_id, question_id, repetition_num, ease_factor, interval_days, quality_score, last_reviewed, next_review_at) VALUES ?',
      [rows.slice(i, i + 200)]
    );
  }
}

router.get('/calendar', apiAuth, async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const now = new Date();
    const year = Number(req.query.year) || now.getFullYear();
    const month = Math.min(12, Math.max(1, Number(req.query.month) || now.getMonth() + 1));

    await ensureSchedule(studentId);

    const items = await q(
      `SELECT sr.next_review_at, q.topic_id, t.name AS topic, s.code AS subject_code, s.id AS subject_id
         FROM spaced_repetition_items sr
         JOIN questions q ON q.id = sr.question_id
         JOIN topics t ON t.id = q.topic_id
         JOIN subjects s ON s.id = t.subject_id
        WHERE sr.student_id = ?`,
      [studentId]
    );

    // byDate[date][topicId] = { topic, subject_code, count }
    const byDate = new Map();
    for (const it of items) {
      const date = String(it.next_review_at).slice(0, 10);
      if (!byDate.has(date)) byDate.set(date, new Map());
      const topics = byDate.get(date);
      if (!topics.has(it.topic_id)) {
        topics.set(it.topic_id, { topic: it.topic, subject_code: it.subject_code, count: 0 });
      }
      topics.get(it.topic_id).count++;
    }

    const todayStr = toSqlDate(now);
    const todayStart = startOfDay(now);
    const daysInMonth = new Date(year, month, 0).getDate();

    const days = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const ds = toSqlDate(date);
      const topics = byDate.get(ds);
      let reviewCount = 0;
      const events = [];
      if (topics) {
        for (const [topicId, t] of topics) {
          reviewCount += t.count;
          events.push({ id: Number(topicId), topic: t.topic, subject_code: t.subject_code, count: t.count });
        }
        events.sort((a, b) => b.count - a.count);
      }
      days.push({
        date: ds,
        day,
        has_review: reviewCount > 0,
        review_count: reviewCount,
        is_today: ds === todayStr,
        is_past: date < todayStart && ds !== todayStr,
        events,
      });
    }

    // Today's due reviews: everything due on or before today, grouped by topic.
    const dueByTopic = new Map();
    for (const [date, topics] of byDate) {
      if (parseSql(date) > todayStart) continue;
      for (const [topicId, event] of topics) {
        if (!dueByTopic.has(topicId)) {
          dueByTopic.set(topicId, { id: Number(topicId), topic: event.topic, subject_code: event.subject_code, count: 0 });
        }
        dueByTopic.get(topicId).count += event.count;
      }
    }
    const todayReviews = [...dueByTopic.values()]
      .sort((a, b) => b.count - a.count)
      .map((e) => ({ id: e.id, topic: e.topic, subject_code: e.subject_code, due_at: new Date().toISOString() }));

    // Upcoming: next 7 days.
    const upcoming = [];
    for (let i = 1; i <= 7 && upcoming.length < 6; i++) {
      const ds = toSqlDate(addDays(now, i));
      const topics = byDate.get(ds);
      if (!topics) continue;
      for (const event of topics.values()) {
        if (upcoming.length >= 6) break;
        upcoming.push({ date: ds, topic: event.topic, subject_code: event.subject_code });
      }
    }

    res.json({
      year,
      month,
      month_name: MONTHS[month - 1],
      days,
      today_reviews: todayReviews,
      upcoming,
      due_count: todayReviews.reduce((sum, e) => sum + (dueByTopic.get(e.id)?.count ?? 0), 0),
      has_data: items.length > 0,
    });
  } catch (err) { next(err); }
});

module.exports = { router };
