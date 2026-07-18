// Performance analytics, mirroring the web version's PerformanceApiController
// logic, shaped for the mobile performance screen.
const express = require('express');
const { q, one } = require('../db');
const { apiAuth } = require('../middleware/auth');
const weakness = require('../services/weakness');
const streakService = require('../services/streak');
const { toSqlDate, toSqlDateTime, addDays, startOfDay } = require('../utils/dates');

const router = express.Router();

router.get('/performance', apiAuth, async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const baseWhere = "student_id = ? AND session_type != 'training' AND completed_at IS NOT NULL";

    const all = await one(
      `SELECT COUNT(*) sessions,
              COALESCE(SUM(total_items),0) attempted,
              COALESCE(SUM(correct_answers),0) correct,
              COALESCE(SUM(duration_secs),0) duration,
              COALESCE(AVG(score_percent),0) avg_score
         FROM quiz_sessions WHERE ${baseWhere}`,
      [studentId]
    );

    const attempted = Number(all.attempted);
    const correct = Number(all.correct);
    const overallAccuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;

    const streakDays = await streakService.current(studentId);

    // 7-day daily series (questions + accuracy per day)
    const dailySeries = [];
    for (let i = 6; i >= 0; i--) {
      const day = startOfDay(addDays(new Date(), -i));
      const nextDay = addDays(day, 1);
      const row = await one(
        `SELECT COALESCE(SUM(total_items),0) att, COALESCE(SUM(correct_answers),0) cor
           FROM quiz_sessions WHERE ${baseWhere} AND started_at >= ? AND started_at < ?`,
        [studentId, toSqlDateTime(day), toSqlDateTime(nextDay)]
      );
      const att = Number(row.att);
      dailySeries.push({
        date: toSqlDate(day),
        questions: att,
        accuracy: att > 0 ? Math.round((Number(row.cor) / att) * 100) : 0,
      });
    }

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
        accuracy_rate: attemptsCount > 0 ? Number(r.correct_count) / attemptsCount : 0,
        is_weak: isWeak,
      };
    });

    const strengths = topicStats
      .filter((t) => t.attempts >= weakness.MIN_ATTEMPTS && t.accuracy_rate >= 0.75)
      .sort((a, b) => b.accuracy_rate - a.accuracy_rate)
      .map(({ is_weak, ...t }) => t);

    const weaknesses = topicStats
      .filter((t) => t.is_weak)
      .sort((a, b) => a.accuracy_rate - b.accuracy_rate)
      .map(({ is_weak, ...t }) => t);

    const bySubject = (await q(
      `SELECT s.id, s.code, s.name, s.color,
              COALESCE(SUM(pr.correct_count),0) correct,
              COALESCE(SUM(pr.total_attempts),0) attempts,
              (SELECT COUNT(*) FROM quiz_sessions qs
                WHERE qs.student_id = ? AND qs.subject_id = s.id
                  AND qs.session_type != 'training' AND qs.completed_at IS NOT NULL) sessions
         FROM subjects s
         LEFT JOIN topics t ON t.subject_id = s.id
         LEFT JOIN performance_records pr ON pr.topic_id = t.id AND pr.student_id = ?
        GROUP BY s.id, s.code, s.name, s.color
        ORDER BY s.id`,
      [studentId, studentId]
    )).map((r) => ({
      subject_id: r.id,
      code: r.code,
      name: r.name,
      color: r.color,
      accuracy: Number(r.attempts) > 0 ? Math.round((Number(r.correct) / Number(r.attempts)) * 100) : 0,
      sessions: Number(r.sessions),
    }));

    const byModeRows = await q(
      `SELECT mode, COUNT(*) sessions, COALESCE(AVG(score_percent),0) avg_score
         FROM quiz_sessions WHERE ${baseWhere}
        GROUP BY mode`,
      [studentId]
    );
    const byModeMap = new Map(byModeRows.map((r) => [r.mode, r]));
    const byQuizType = ['adaptive', 'topic', 'timed', 'challenge'].map((mode) => ({
      mode,
      sessions: Number(byModeMap.get(mode)?.sessions ?? 0),
      avg_score: Math.round(Number(byModeMap.get(mode)?.avg_score ?? 0)),
    }));

    res.json({
      overall_accuracy: overallAccuracy,
      total_sessions: Number(all.sessions),
      total_questions: attempted,
      average_score: Math.round(Number(all.avg_score)),
      best_streak: streakDays,
      study_hours: Math.round(Number(all.duration) / 3600),
      daily_series: dailySeries,
      strengths,
      weaknesses,
      by_subject: bySubject,
      by_quiz_type: byQuizType,
    });
  } catch (err) { next(err); }
});

module.exports = { router };
