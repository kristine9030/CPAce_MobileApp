// Dashboard, mirroring the web version's DashboardApiController but shaped for
// the mobile screens (streak, points, days_to_exam, mastery, etc.).
const express = require('express');
const { q, one } = require('../db');
const { apiAuth } = require('../middleware/auth');
const streakService = require('../services/streak');
const { toSqlDateTime, addDays, parseSql, startOfDay, toIso } = require('../utils/dates');

const router = express.Router();

router.get('/dashboard', apiAuth, async (req, res, next) => {
  try {
    const studentId = req.user.id;

    const profile = await one('SELECT * FROM student_profiles WHERE user_id = ?', [studentId]);
    const streak = await streakService.current(studentId);
    const points = Number(profile?.total_points ?? 0);
    const examDate = profile?.exam_target_date ?? null;
    const daysToExam = examDate
      ? Math.max(0, Math.ceil((startOfDay(parseSql(examDate)).getTime() - startOfDay(new Date()).getTime()) / 86400000))
      : null;

    const weekAgo = toSqlDateTime(addDays(new Date(), -7));
    const baseWhere = "student_id = ? AND session_type != 'training' AND completed_at IS NOT NULL";

    const [attempted] = await q(`SELECT COALESCE(SUM(total_items),0) v FROM quiz_sessions WHERE ${baseWhere}`, [studentId]);
    const [attemptedWeek] = await q(`SELECT COALESCE(SUM(total_items),0) v FROM quiz_sessions WHERE ${baseWhere} AND started_at >= ?`, [studentId, weekAgo]);
    const [secs] = await q("SELECT COALESCE(SUM(duration_secs),0) v FROM quiz_sessions WHERE student_id = ? AND session_type != 'training'", [studentId]);
    const [secsWeek] = await q("SELECT COALESCE(SUM(duration_secs),0) v FROM quiz_sessions WHERE student_id = ? AND session_type != 'training' AND started_at >= ?", [studentId, weekAgo]);

    const agg = await one('SELECT COALESCE(SUM(correct_count),0) c, COALESCE(SUM(total_attempts),0) t FROM performance_records WHERE student_id = ?', [studentId]);
    const readiness = agg && Number(agg.t) > 0 ? Math.round((Number(agg.c) / Number(agg.t)) * 100) : 0;

    const subjectMastery = (await q(
      `SELECT s.id, s.code, s.name, s.color,
              COALESCE(SUM(pr.correct_count),0) correct,
              COALESCE(SUM(pr.total_attempts),0) attempts
         FROM subjects s
         LEFT JOIN topics t ON t.subject_id = s.id
         LEFT JOIN performance_records pr ON pr.topic_id = t.id AND pr.student_id = ?
        GROUP BY s.id, s.code, s.name, s.color
        ORDER BY s.id`,
      [studentId]
    )).map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      color: r.color,
      mastery: Number(r.attempts) > 0 ? Math.round((Number(r.correct) / Number(r.attempts)) * 100) : 0,
    }));

    const weaknesses = await q(
      `SELECT t.name AS topic, s.code AS subject_code, pr.accuracy_rate
         FROM performance_records pr
         JOIN topics t ON t.id = pr.topic_id
         JOIN subjects s ON s.id = t.subject_id
        WHERE pr.student_id = ? AND pr.total_attempts > 0
        ORDER BY pr.accuracy_rate ASC, pr.total_attempts DESC
        LIMIT 3`,
      [studentId]
    );

    const recentActivity = (await q(
      `SELECT qs.id, qs.mode, qs.session_type, qs.total_items, qs.correct_answers, qs.score_percent,
              qs.started_at, qs.completed_at, s.code AS subject_code
         FROM quiz_sessions qs
         LEFT JOIN subjects s ON s.id = qs.subject_id
        WHERE qs.student_id = ? AND qs.session_type != 'training'
        ORDER BY qs.started_at DESC
        LIMIT 5`,
      [studentId]
    )).map((r) => ({
      ...r,
      score_percent: r.score_percent != null ? Number(r.score_percent) : null,
      started_at: toIso(r.started_at),
      completed_at: toIso(r.completed_at),
    }));

    const [unread] = await q('SELECT COUNT(*) v FROM notifications WHERE recipient_id = ? AND is_read = 0', [studentId]);

    res.json({
      streak,
      points,
      days_to_exam: daysToExam,
      questions_attempted: Number(attempted.v),
      questions_this_week: Number(attemptedWeek.v),
      study_hours: Math.round(Number(secs.v) / 3600),
      study_hours_week: Math.round(Number(secsWeek.v) / 3600),
      readiness,
      subject_mastery: subjectMastery,
      weaknesses,
      recent_activity: recentActivity,
      unread_notifications: Number(unread.v),
    });
  } catch (err) { next(err); }
});

module.exports = { router };
