const express = require('express');
const { q, one } = require('../db');
const { apiAuth } = require('../middleware/auth');

const router = express.Router();

let tablesReady = false;
async function ensureTables() {
  if (tablesReady) return;
  await q(`CREATE TABLE IF NOT EXISTS student_achievements (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    student_id INT UNSIGNED NOT NULL,
    achievement_key VARCHAR(40) NOT NULL,
    earned_at DATETIME NOT NULL,
    UNIQUE KEY uq_student_ach (student_id, achievement_key)
  )`);
  tablesReady = true;
}

const ACHIEVEMENTS = [
  {
    key: 'first_quiz',
    title: 'First Quiz',
    description: 'Complete your first quiz.',
    icon: 'flash',
    color: '#FF6B35',
    category: 'milestone',
    async check(studentId) {
      const row = await one('SELECT COUNT(*) c FROM quiz_sessions WHERE student_id = ? AND completed_at IS NOT NULL', [studentId]);
      const count = Number(row.c);
      return { unlocked: count >= 1, progress: Math.min(100, count * 100), max: 1, current: count };
    },
  },
  {
    key: 'streak_3',
    title: '3-Day Streak',
    description: 'Study 3 days in a row.',
    icon: 'flame',
    color: '#F59E0B',
    category: 'consistency',
    async check(studentId) {
      const row = await one('SELECT streak_days FROM student_profiles WHERE user_id = ?', [studentId]);
      const streak = Number(row?.streak_days ?? 0);
      return { unlocked: streak >= 3, progress: Math.min(100, Math.round((streak / 3) * 100)), max: 3, current: streak };
    },
  },
  {
    key: 'streak_7',
    title: 'Week Warrior',
    description: 'Study 7 days in a row.',
    icon: 'flame',
    color: '#F97316',
    category: 'consistency',
    async check(studentId) {
      const row = await one('SELECT streak_days FROM student_profiles WHERE user_id = ?', [studentId]);
      const streak = Number(row?.streak_days ?? 0);
      return { unlocked: streak >= 7, progress: Math.min(100, Math.round((streak / 7) * 100)), max: 7, current: streak };
    },
  },
  {
    key: 'streak_30',
    title: 'Monthly Champion',
    description: 'Study 30 days in a row.',
    icon: 'flame',
    color: '#EF4444',
    category: 'consistency',
    async check(studentId) {
      const row = await one('SELECT streak_days FROM student_profiles WHERE user_id = ?', [studentId]);
      const streak = Number(row?.streak_days ?? 0);
      return { unlocked: streak >= 30, progress: Math.min(100, Math.round((streak / 30) * 100)), max: 30, current: streak };
    },
  },
  {
    key: 'points_100',
    title: '100 Points',
    description: 'Earn 100 total points.',
    icon: 'star',
    color: '#8B5CF6',
    category: 'milestone',
    async check(studentId) {
      const row = await one('SELECT total_points FROM student_profiles WHERE user_id = ?', [studentId]);
      const pts = Number(row?.total_points ?? 0);
      return { unlocked: pts >= 100, progress: Math.min(100, Math.round((pts / 100) * 100)), max: 100, current: pts };
    },
  },
  {
    key: 'points_500',
    title: '500 Points',
    description: 'Earn 500 total points.',
    icon: 'star',
    color: '#7C3AED',
    category: 'milestone',
    async check(studentId) {
      const row = await one('SELECT total_points FROM student_profiles WHERE user_id = ?', [studentId]);
      const pts = Number(row?.total_points ?? 0);
      return { unlocked: pts >= 500, progress: Math.min(100, Math.round((pts / 500) * 100)), max: 500, current: pts };
    },
  },
  {
    key: 'points_1000',
    title: 'Point Millionaire',
    description: 'Earn 1,000 total points.',
    icon: 'trophy',
    color: '#10B981',
    category: 'milestone',
    async check(studentId) {
      const row = await one('SELECT total_points FROM student_profiles WHERE user_id = ?', [studentId]);
      const pts = Number(row?.total_points ?? 0);
      return { unlocked: pts >= 1000, progress: Math.min(100, Math.round((pts / 1000) * 100)), max: 1000, current: pts };
    },
  },
  {
    key: 'points_5000',
    title: 'CPACE Legend',
    description: 'Earn 5,000 total points.',
    icon: 'trophy',
    color: '#047857',
    category: 'milestone',
    async check(studentId) {
      const row = await one('SELECT total_points FROM student_profiles WHERE user_id = ?', [studentId]);
      const pts = Number(row?.total_points ?? 0);
      return { unlocked: pts >= 5000, progress: Math.min(100, Math.round((pts / 5000) * 100)), max: 5000, current: pts };
    },
  },
  {
    key: 'topic_explorer',
    title: 'Topic Explorer',
    description: 'Complete quizzes in 10 different topics.',
    icon: 'book',
    color: '#3B82F6',
    category: 'milestone',
    async check(studentId) {
      const row = await one('SELECT COUNT(DISTINCT topic_id) c FROM quiz_sessions WHERE student_id = ? AND completed_at IS NOT NULL AND topic_id IS NOT NULL', [studentId]);
      const topics = Number(row.c);
      return { unlocked: topics >= 10, progress: Math.min(100, Math.round((topics / 10) * 100)), max: 10, current: topics };
    },
  },
  {
    key: 'quick_thinker',
    title: 'Quick Thinker',
    description: 'Answer 20 questions correctly in under 10 minutes.',
    icon: 'bolt',
    color: '#EAB308',
    category: 'performance',
    async check(studentId) {
      const row = await one(
        `SELECT COUNT(*) c FROM quiz_sessions
         WHERE student_id = ? AND completed_at IS NOT NULL
           AND total_items >= 20 AND duration_secs IS NOT NULL AND duration_secs <= 600
           AND score_percent >= 75`,
        [studentId]
      );
      const count = Number(row.c);
      return { unlocked: count >= 1, progress: count >= 1 ? 100 : 0, max: 1, current: count };
    },
  },
  {
    key: 'sharpshooter',
    title: 'Sharpshooter',
    description: 'Score 90% or higher on any quiz.',
    icon: 'bullseye',
    color: '#EC4899',
    category: 'performance',
    async check(studentId) {
      const row = await one(
        `SELECT COUNT(*) c FROM quiz_sessions
         WHERE student_id = ? AND completed_at IS NOT NULL AND score_percent >= 90`,
        [studentId]
      );
      const count = Number(row.c);
      return { unlocked: count >= 1, progress: count >= 1 ? 100 : 0, max: 1, current: count };
    },
  },
  {
    key: 'centurion',
    title: 'Centurion',
    description: 'Answer 100 questions across all quizzes.',
    icon: 'help-buoy',
    color: '#14B8A6',
    category: 'milestone',
    async check(studentId) {
      const row = await one("SELECT COALESCE(SUM(total_items),0) c FROM quiz_sessions WHERE student_id = ? AND session_type != 'training' AND is_practice_room = 0", [studentId]);
      const total = Number(row.c);
      return { unlocked: total >= 100, progress: Math.min(100, Math.round((total / 100) * 100)), max: 100, current: total };
    },
  },
  {
    key: 'mock_master',
    title: 'Mock Master',
    description: 'Complete 5 mock exams.',
    icon: 'document-text',
    color: '#DB2777',
    category: 'performance',
    async check(studentId) {
      const row = await one(
        `SELECT COUNT(*) c FROM quiz_sessions
         WHERE student_id = ? AND completed_at IS NOT NULL AND session_type = 'mock_exam'`,
        [studentId]
      );
      const count = Number(row.c);
      return { unlocked: count >= 5, progress: Math.min(100, Math.round((count / 5) * 100)), max: 5, current: count };
    },
  },
  {
    key: 'time_manager',
    title: 'Time Manager',
    description: 'Finish 10 timed quizzes with 70%+ accuracy.',
    icon: 'clock',
    color: '#0D9488',
    category: 'performance',
    async check(studentId) {
      const row = await one(
        `SELECT COUNT(*) c FROM quiz_sessions
         WHERE student_id = ? AND mode = 'timed' AND completed_at IS NOT NULL AND score_percent >= 70`,
        [studentId]
      );
      const count = Number(row.c);
      return { unlocked: count >= 10, progress: Math.min(100, Math.round((count / 10) * 100)), max: 10, current: count };
    },
  },
  {
    key: 'board_ready',
    title: 'Board Ready',
    description: 'Reach 80% overall readiness.',
    icon: 'school',
    color: '#6366F1',
    category: 'performance',
    async check(studentId) {
      const agg = await one('SELECT COALESCE(SUM(correct_count),0) c, COALESCE(SUM(total_attempts),0) t FROM performance_records WHERE student_id = ?', [studentId]);
      const total = Number(agg.t);
      const correct = Number(agg.c);
      const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
      return { unlocked: accuracy >= 80, progress: Math.min(100, accuracy), max: 80, current: accuracy };
    },
  },
  {
    key: 'subject_master',
    title: 'Subject Master',
    description: 'Achieve 80%+ accuracy in any subject.',
    icon: 'layers',
    color: '#A855F7',
    category: 'performance',
    async check(studentId) {
      const rows = await q(
        `SELECT s.id, COALESCE(SUM(pr.correct_count),0) c, COALESCE(SUM(pr.total_attempts),0) t
           FROM subjects s
           JOIN topics tp ON tp.subject_id = s.id
           LEFT JOIN performance_records pr ON pr.topic_id = tp.id AND pr.student_id = ?
          GROUP BY s.id
         HAVING t > 0`,
        [studentId]
      );
      const best = rows.reduce((max, r) => {
        const acc = Number(r.t) > 0 ? Math.round((Number(r.c) / Number(r.t)) * 100) : 0;
        return acc > max ? acc : max;
      }, 0);
      return { unlocked: best >= 80, progress: Math.min(100, best), max: 80, current: best };
    },
  },
  {
    key: 'score_booster',
    title: 'Score Booster',
    description: 'Improve overall accuracy by 10%.',
    icon: 'trending-up',
    color: '#22C55E',
    category: 'performance',
    async check(studentId) {
      const recent = await one(
        `SELECT COALESCE(SUM(correct_count),0) c, COALESCE(SUM(total_attempts),0) t
           FROM performance_records
          WHERE student_id = ? AND last_attempted >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
        [studentId]
      );
      const past = await one(
        `SELECT COALESCE(SUM(correct_count),0) c, COALESCE(SUM(total_attempts),0) t
           FROM performance_records
          WHERE student_id = ? AND last_attempted < DATE_SUB(NOW(), INTERVAL 7 DAY)`,
        [studentId]
      );
      const recentAcc = Number(recent.t) > 0 ? (Number(recent.c) / Number(recent.t)) * 100 : 0;
      const pastAcc = Number(past.t) > 0 ? (Number(past.c) / Number(past.t)) * 100 : 0;
      const diff = recentAcc - pastAcc;
      return { unlocked: diff >= 10, progress: Math.min(100, Math.max(0, Math.round((diff / 10) * 100))), max: 10, current: Math.round(diff * 10) / 10 };
    },
  },
];

router.get('/achievements', apiAuth, async (req, res, next) => {
  try {
    await ensureTables();
    const studentId = req.user.id;

    const earnedRows = await q('SELECT achievement_key, earned_at FROM student_achievements WHERE student_id = ?', [studentId]);
    const earnedMap = new Map(earnedRows.map((r) => [r.achievement_key, r.earned_at]));

    const results = await Promise.all(
      ACHIEVEMENTS.map(async (ach) => {
        const result = await ach.check(studentId);
        const alreadyEarned = earnedMap.has(ach.key);
        if (result.unlocked && !alreadyEarned) {
          await q('INSERT INTO student_achievements (student_id, achievement_key, earned_at) VALUES (?, ?, NOW())', [studentId, ach.key]);
          earnedMap.set(ach.key, new Date().toISOString().slice(0, 19).replace('T', ' '));
        }
        return {
          key: ach.key,
          title: ach.title,
          description: ach.description,
          icon: ach.icon,
          color: ach.color,
          category: ach.category,
          unlocked: result.unlocked,
          progress: result.progress,
          current: result.current,
          max: result.max,
          earned_at: result.unlocked ? (earnedMap.get(ach.key) || null) : null,
        };
      })
    );

    const unlockedCount = results.filter((r) => r.unlocked).length;
    const totalCount = results.length;

    res.json({ achievements: results, summary: { unlocked: unlockedCount, total: totalCount } });
  } catch (err) { next(err); }
});

async function evaluateAndAward(studentId) {
  await ensureTables();
  const earnedRows = await q('SELECT achievement_key FROM student_achievements WHERE student_id = ?', [studentId]);
  const earnedSet = new Set(earnedRows.map((r) => r.achievement_key));

  const results = await Promise.all(
    ACHIEVEMENTS.map(async (ach) => {
      if (earnedSet.has(ach.key)) return null;
      const result = await ach.check(studentId);
      if (result.unlocked) {
        await q('INSERT INTO student_achievements (student_id, achievement_key, earned_at) VALUES (?, ?, NOW())', [studentId, ach.key]);
        return ach.key;
      }
      return null;
    })
  );

  return results.filter(Boolean);
}

module.exports = { router, evaluateAndAward };
