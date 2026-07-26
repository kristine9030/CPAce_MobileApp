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
      const topicRows = await q(
        `SELECT t.id, t.name, t.description,
                (SELECT COUNT(*) FROM questions q WHERE q.topic_id = t.id AND q.is_active = 1) AS question_count,
                (SELECT COUNT(*) FROM materials m WHERE m.topic_id = t.id AND m.is_active = 1) AS material_count,
                COALESCE(pr.total_attempts, 0) AS total_attempts,
                COALESCE(pr.correct_count, 0) AS correct_count
           FROM topics t
           LEFT JOIN performance_records pr ON pr.topic_id = t.id AND pr.student_id = ?
          WHERE t.subject_id = ? AND t.is_active = 1
          ORDER BY t.sort_order ASC, t.name ASC`,
        [studentId, subject.id]
      );

      const topicIds = topicRows.map((t) => t.id);
      const passingThreshold = Number(subject.passing_threshold);
      const topics = topicRows.map((t) => {
        const attempted = Number(t.total_attempts) > 0;
        const topicMastery = attempted
          ? Math.round((Number(t.correct_count) / Number(t.total_attempts)) * 100)
          : 0;

        return {
          id: t.id,
          name: t.name,
          description: t.description,
          question_count: Number(t.question_count),
          material_count: Number(t.material_count),
          mastery: topicMastery,
          // "Weak" mirrors the web: an attempted topic scoring below the
          // subject's passing threshold.
          is_weak: attempted && topicMastery < passingThreshold,
        };
      });

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
        topic_count: topics.length,
        question_count: questionCount,
        weak_count: topics.filter((t) => t.is_weak).length,
        mastery,
        passing_threshold: passingThreshold,
        is_passing: attempts > 0 && mastery >= passingThreshold,
        topics,
      });
    }

    res.json({ subjects });
  } catch (err) { next(err); }
});

router.get('/subjects/:id/topics', apiAuth, async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const subjectId = Number(req.params.id);

    const subject = await one('SELECT * FROM subjects WHERE id = ? AND is_active = 1', [subjectId]);
    if (!subject) return res.status(404).json({ message: 'Subject not found.' });

    // Scalar subqueries instead of joins — joining questions and materials at
    // once would multiply the rows and inflate both counts.
    const rows = await q(
      `SELECT t.id, t.name, t.description,
              (SELECT COUNT(*) FROM questions q WHERE q.topic_id = t.id AND q.is_active = 1) AS question_count,
              (SELECT COUNT(*) FROM materials m WHERE m.topic_id = t.id AND m.is_active = 1) AS material_count,
              COALESCE(pr.total_attempts, 0) AS total_attempts,
              COALESCE(pr.correct_count, 0) AS correct_count
         FROM topics t
         LEFT JOIN performance_records pr ON pr.topic_id = t.id AND pr.student_id = ?
        WHERE t.subject_id = ? AND t.is_active = 1
        ORDER BY t.sort_order ASC, t.name ASC`,
      [studentId, subjectId]
    );

    const passingThreshold = Number(subject.passing_threshold);
    const topics = rows.map((r) => {
      const attempted = Number(r.total_attempts) > 0;
      const mastery = attempted
        ? Math.round((Number(r.correct_count) / Number(r.total_attempts)) * 100)
        : 0;

      return {
        id: r.id,
        name: r.name,
        description: r.description,
        question_count: Number(r.question_count),
        material_count: Number(r.material_count),
        mastery,
        is_weak: attempted && mastery < passingThreshold,
      };
    });

    res.json({
      subject: {
        id: subject.id,
        code: subject.code,
        name: subject.name,
        description: subject.description,
        color: subject.color,
        icon: subject.icon,
        topic_count: topics.length,
        question_count: topics.reduce((sum, t) => sum + t.question_count, 0),
        weak_count: topics.filter((t) => t.is_weak).length,
      },
      topics,
    });
  } catch (err) { next(err); }
});

// Study materials attached to one topic, mirroring the web's
// Student\SubjectController@topic + topic-materials.blade.php.
router.get('/subjects/:id/topics/:topicId/materials', apiAuth, async (req, res, next) => {
  try {
    const subjectId = Number(req.params.id);
    const topicId = Number(req.params.topicId);

    const subject = await one('SELECT * FROM subjects WHERE id = ? AND is_active = 1', [subjectId]);
    if (!subject) return res.status(404).json({ message: 'Subject not found.' });

    const topic = await one(
      'SELECT * FROM topics WHERE id = ? AND subject_id = ? AND is_active = 1',
      [topicId, subjectId]
    );
    if (!topic) return res.status(404).json({ message: 'Topic not found.' });

    const rows = await q(
      `SELECT m.id, m.title, m.description, m.kind, m.file_category, m.file_path,
              m.original_name, m.file_size, m.external_url,
              u.first_name, u.last_name
         FROM materials m
         LEFT JOIN users u ON u.id = m.uploaded_by
        WHERE m.topic_id = ? AND m.is_active = 1
        ORDER BY m.id DESC`,
      [topicId]
    );

    // Uploaded files live on the Laravel public disk, served by XAMPP — not by
    // this Express process. WEB_BASE_URL points at the Laravel public/ folder;
    // by default we assume it sits on the same host this request came in on.
    const webBase = (process.env.WEB_BASE_URL || `http://${req.hostname}/CPACE/CPACE/public`).replace(/\/+$/, '');

    const materials = rows.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      kind: m.kind,
      file_category: m.kind === 'link' ? 'link' : m.file_category,
      original_name: m.original_name,
      file_size: m.file_size == null ? null : Number(m.file_size),
      human_size: humanSize(m.file_size),
      uploader_name: m.first_name ? `${m.first_name} ${m.last_name}`.trim() : null,
      url: m.kind === 'link'
        ? m.external_url
        : (m.file_path ? `${webBase}/storage/${m.file_path}` : null),
    }));

    res.json({
      subject: {
        id: subject.id,
        code: subject.code,
        name: subject.name,
        color: subject.color,
      },
      topic: {
        id: topic.id,
        name: topic.name,
        description: topic.description,
      },
      materials,
    });
  } catch (err) { next(err); }
});

/** Human-readable file size, e.g. "1.4 MB" — same rounding as Material::humanSize(). */
function humanSize(bytes) {
  const size = Number(bytes);
  if (!size) return null;

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }

  const decimals = value < 10 && i > 0 ? 1 : 0;
  return `${Number(value.toFixed(decimals))} ${units[i]}`;
}

module.exports = { router };
