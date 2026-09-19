// Global search across everything a student can reach from the app: subjects,
// topics, learning materials, their own review notes, class quizzes, and the
// community feed/library. One endpoint so the search screen stays a single
// round trip.
const express = require('express');
const { q } = require('../db');
const { apiAuth } = require('../middleware/auth');
const { fmtDay } = require('../utils/dates');

const router = express.Router();

const PER_GROUP = 8;

router.get('/search', apiAuth, async (req, res, next) => {
  try {
    const term = String(req.query.q ?? '').trim();
    if (term.length < 2) {
      return res.json({ query: term, groups: [], total: 0 });
    }

    const like = `%${term}%`;
    const studentId = req.user.id;

    const [subjects, topics, materials, notes, quizzes, posts, resources] = await Promise.all([
      q(
        `SELECT id, code, name FROM subjects
          WHERE is_active = 1 AND (code LIKE ? OR name LIKE ?)
          ORDER BY code LIMIT ?`,
        [like, like, PER_GROUP]
      ),
      q(
        `SELECT t.id, t.name, t.subject_id, s.code AS subject_code
           FROM topics t JOIN subjects s ON s.id = t.subject_id
          WHERE t.name LIKE ?
          ORDER BY s.code, t.name LIMIT ?`,
        [like, PER_GROUP]
      ),
      q(
        `SELECT m.id, m.title, m.kind, m.file_category, m.topic_id,
                t.name AS topic_name, s.code AS subject_code, s.id AS subject_id
           FROM materials m
           LEFT JOIN topics t ON t.id = m.topic_id
           LEFT JOIN subjects s ON s.id = t.subject_id
          WHERE m.title LIKE ? OR m.description LIKE ?
          ORDER BY m.id DESC LIMIT ?`,
        [like, like, PER_GROUP]
      ),
      q(
        `SELECT n.id, n.title, n.content, n.created_at, s.code AS subject_code
           FROM review_notes n
           LEFT JOIN subjects s ON s.id = n.subject_id
          WHERE n.student_id = ? AND n.deleted_at IS NULL
            AND (n.title LIKE ? OR n.content LIKE ? OR n.tags LIKE ?)
          ORDER BY n.created_at DESC LIMIT ?`,
        [studentId, like, like, like, PER_GROUP]
      ),
      q(
        `SELECT fq.id, fq.title, fq.share_token, fq.status, fq.due_at, s.code AS subject_code
           FROM faculty_quizzes fq
           LEFT JOIN subjects s ON s.id = fq.subject_id
          WHERE fq.status IN ('published','closed') AND fq.title LIKE ?
          ORDER BY fq.due_at IS NULL, fq.due_at LIMIT ?`,
        [like, PER_GROUP]
      ),
      q(
        `SELECT cp.id, cp.title, cp.body, cp.post_type, cp.created_at,
                u.first_name, u.last_name
           FROM community_posts cp
           LEFT JOIN users u ON u.id = cp.author_id
          WHERE cp.title LIKE ? OR cp.body LIKE ?
          ORDER BY cp.created_at DESC LIMIT ?`,
        [like, like, PER_GROUP]
      ),
      q(
        `SELECT cr.id, cr.title, cr.description, cr.file_category, s.code AS subject_code
           FROM community_resources cr
           LEFT JOIN subjects s ON s.id = cr.subject_id
          WHERE cr.title LIKE ? OR cr.description LIKE ? OR cr.original_name LIKE ?
          ORDER BY cr.downloads_count DESC LIMIT ?`,
        [like, like, like, PER_GROUP]
      ),
    ]);

    const snippet = (text, max = 110) => {
      const plain = String(text ?? '').replace(/\s+/g, ' ').trim();
      return plain.length > max ? `${plain.slice(0, max)}…` : plain;
    };

    // Each hit carries the route the app should open, so the search screen
    // doesn't need a per-type switch of its own.
    const groups = [
      {
        key: 'subjects',
        label: 'Subjects',
        icon: 'book',
        items: subjects.map((r) => ({
          id: r.id,
          title: `${r.code} — ${r.name}`,
          subtitle: 'Subject',
          route: '/subject-detail',
          params: { subjectId: String(r.id) },
        })),
      },
      {
        key: 'topics',
        label: 'Topics',
        icon: 'list',
        items: topics.map((r) => ({
          id: r.id,
          title: r.name,
          subtitle: r.subject_code,
          route: '/subject-detail',
          params: { subjectId: String(r.subject_id) },
        })),
      },
      {
        key: 'materials',
        label: 'Learning Materials',
        icon: 'document-attach',
        items: materials.map((r) => ({
          id: r.id,
          title: r.title,
          subtitle: [r.subject_code, r.topic_name].filter(Boolean).join(' · '),
          route: '/topic-materials',
          params: { topicId: String(r.topic_id), subjectId: String(r.subject_id ?? '') },
        })),
      },
      {
        key: 'notes',
        label: 'My Review Notes',
        icon: 'document-text',
        items: notes.map((r) => ({
          id: r.id,
          title: r.title,
          subtitle: [r.subject_code, snippet(r.content, 60)].filter(Boolean).join(' · '),
          route: '/(tabs)/notes',
          params: { noteId: String(r.id) },
        })),
      },
      {
        key: 'class_quizzes',
        label: 'Class Quizzes',
        icon: 'clipboard',
        items: quizzes.map((r) => ({
          id: r.id,
          title: r.title,
          subtitle: [r.subject_code, r.due_at ? `Due ${fmtDay(r.due_at)}` : null].filter(Boolean).join(' · '),
          route: '/class-quiz/[token]',
          params: { token: r.share_token },
        })),
      },
      {
        key: 'community',
        label: 'Community Posts',
        icon: 'people',
        items: posts.map((r) => ({
          id: r.id,
          title: r.title || snippet(r.body, 60),
          subtitle: `${r.first_name ? `${r.first_name} ${r.last_name ?? ''}`.trim() : 'CPAce member'} · ${fmtDay(r.created_at)}`,
          route: '/community',
          params: { postId: String(r.id) },
        })),
      },
      {
        key: 'resources',
        label: 'Resource Library',
        icon: 'folder-open',
        items: resources.map((r) => ({
          id: r.id,
          title: r.title,
          subtitle: [r.subject_code, snippet(r.description, 60)].filter(Boolean).join(' · '),
          route: '/community/resources',
          params: { resourceId: String(r.id) },
        })),
      },
    ].filter((g) => g.items.length > 0);

    res.json({
      query: term,
      groups,
      total: groups.reduce((sum, g) => sum + g.items.length, 0),
    });
  } catch (err) { next(err); }
});

module.exports = { router };
