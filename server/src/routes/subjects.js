// Subjects list, mirroring the web version's SubjectsApiController.
const express = require('express');
const { q, one } = require('../db');
const { apiAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/subjects', apiAuth, async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const rows = await q('SELECT * FROM subjects WHERE is_active = 1 ORDER BY id');

    const subjects = [];
    for (const subject of rows) {
      const topicIds = (await q('SELECT id FROM topics WHERE subject_id = ? AND is_active = 1', [subject.id])).map((t) => t.id);

      let questionCount = 0;
      let mastery = 0;
      let attempts = 0;
      if (topicIds.length) {
        const [qc] = await q('SELECT COUNT(*) v FROM questions WHERE is_active = 1 AND topic_id IN (?)', [topicIds]);
        questionCount = Number(qc.v);
        const perf = await one(
          'SELECT COALESCE(SUM(correct_count),0) c, COALESCE(SUM(total_attempts),0) t FROM performance_records WHERE student_id = ? AND topic_id IN (?)',
          [studentId, topicIds]
        );
        attempts = Number(perf.t);
        mastery = attempts > 0 ? Math.round((Number(perf.c) / attempts) * 100) : 0;
      }

      subjects.push({
        id: subject.id,
        code: subject.code,
        name: subject.name,
        description: subject.description,
        color: subject.color,
        icon: subject.icon,
        question_count: questionCount,
        mastery,
        passing_threshold: Number(subject.passing_threshold),
        is_passing: attempts > 0 && mastery >= Number(subject.passing_threshold),
      });
    }

    res.json({ subjects });
  } catch (err) { next(err); }
});

module.exports = { router };
