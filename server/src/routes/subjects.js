const express = require('express');
const { q, one } = require('../db');
const { apiAuth } = require('../middleware/auth');

const router = express.Router();

/** Recursively nest a flat topic list into a tree using parent_id. */
function buildTopicTree(flat, parentId = null) {
  return flat
    .filter(t => t.parent_id === parentId)
    .map(t => {
      const children = buildTopicTree(flat, t.id);
      const childAttempts = children.reduce((s, c) => s + c.total_attempts, 0);
      const childCorrect   = children.reduce((s, c) => s + c.correct_count, 0);
      const totalAttempts  = Number(t.total_attempts) + childAttempts;
      const correctCount   = Number(t.correct_count)  + childCorrect;
      const attempted = totalAttempts > 0;
      const mastery   = attempted ? Math.round((correctCount / totalAttempts) * 100) : 0;
      const childQCount = children.reduce((s, c) => s + c.question_count, 0);
      const childMCount = children.reduce((s, c) => s + c.material_count, 0);

      return {
        id: t.id,
        name: t.name,
        description: t.description,
        parent_id: t.parent_id,
        question_count: Number(t.question_count) + childQCount,
        material_count: Number(t.material_count)  + childMCount,
        mastery,
        is_weak: attempted && mastery < Number(t.passing_threshold),
        total_attempts: totalAttempts,
        correct_count: correctCount,
        children,
      };
    });
}

/** Attach passing_threshold to every topic row from its subject. */
async function attachThreshold(rows, subjectId) {
  const subject = await one('SELECT passing_threshold FROM subjects WHERE id = ?', [subjectId]);
  const threshold = Number(subject?.passing_threshold ?? 75);
  return rows.map(r => ({ ...r, passing_threshold: threshold }));
}

router.get('/subjects', apiAuth, async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const rows = await q('SELECT * FROM subjects WHERE is_active = 1 ORDER BY id');

    const subjects = [];
    for (const subject of rows) {
      const topicRows = await q(
        `SELECT t.id, t.name, t.description, t.parent_id,
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

      const withThreshold = await attachThreshold(topicRows, subject.id);
      const topicTree = buildTopicTree(withThreshold);

      const allIds = withThreshold.map(t => t.id);
      let questionCount = 0;
      let mastery = 0;
      let attempts = 0;
      if (allIds.length) {
        const [qc] = await q('SELECT COUNT(*) v FROM questions WHERE is_active = 1 AND topic_id IN (?)', [allIds]);
        questionCount = Number(qc.v);
        const perf = await one(
          'SELECT COALESCE(SUM(correct_count),0) c, COALESCE(SUM(total_attempts),0) t FROM performance_records WHERE student_id = ? AND topic_id IN (?)',
          [studentId, allIds]
        );
        attempts = Number(perf.t);
        mastery = attempts > 0 ? Math.round((Number(perf.c) / attempts) * 100) : 0;
      }

      const passingThreshold = Number(subject.passing_threshold ?? 75);
      const countWeak = (nodes) => {
        let w = 0;
        for (const n of nodes) {
          if (n.is_weak) w++;
          w += countWeak(n.children);
        }
        return w;
      };

      subjects.push({
        id: subject.id,
        code: subject.code,
        name: subject.name,
        description: subject.description,
        color: subject.color,
        icon: subject.icon,
        topic_count: withThreshold.filter(t => t.parent_id === null).length,
        question_count: questionCount,
        weak_count: countWeak(topicTree),
        mastery,
        passing_threshold: passingThreshold,
        is_passing: attempts > 0 && mastery >= passingThreshold,
        topics: topicTree,
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

    const rows = await q(
      `SELECT t.id, t.name, t.description, t.parent_id,
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

    const withThreshold = await attachThreshold(rows, subjectId);
    const topicTree = buildTopicTree(withThreshold);

    const countWeak = (nodes) => {
      let w = 0;
      for (const n of nodes) {
        if (n.is_weak) w++;
        w += countWeak(n.children);
      }
      return w;
    };

    res.json({
      subject: {
        id: subject.id,
        code: subject.code,
        name: subject.name,
        description: subject.description,
        color: subject.color,
        icon: subject.icon,
        topic_count: rows.filter(r => r.parent_id === null).length,
        question_count: rows.reduce((sum, t) => sum + Number(t.question_count), 0),
        weak_count: countWeak(topicTree),
      },
      topics: topicTree,
    });
  } catch (err) { next(err); }
});

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
