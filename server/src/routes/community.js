// Alumni Community — the shared feed and resource library students read from.
// Mirrors the web CommunityController/CommunityResourceController, with the
// same permission split: posting and uploading are alumni/chair only, while
// students can read, like, comment, and download.
const express = require('express');
const { q, one } = require('../db');
const { apiAuth } = require('../middleware/auth');
const { toIso, nowSql, fmtDay } = require('../utils/dates');

const router = express.Router();

const ROLE = { ADMIN: 1, STUDENT: 2, FACULTY: 3, ALUMNI: 4 };

function canPost(user) {
  const role = Number(user.role_id);
  return role === ROLE.ALUMNI || role === ROLE.ADMIN;
}

/**
 * Files uploaded through the web app live on Laravel's public disk, so they
 * are served from the web app's URL — the same convention the materials
 * endpoint already uses.
 */
function webBase(req) {
  return (process.env.WEB_BASE_URL || `http://${req.hostname}/CPACE/CPACE/public`).replace(/\/+$/, '');
}

function fileUrl(req, filePath) {
  return filePath ? `${webBase(req)}/storage/${filePath}` : null;
}

function humanSize(bytes) {
  const size = Number(bytes);
  if (!size) return null;

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

function authorName(row, prefix = '') {
  const first = row[`${prefix}first_name`];
  const last = row[`${prefix}last_name`];
  return first ? `${first} ${last ?? ''}`.trim() : 'CPAce member';
}

function roleLabel(roleId) {
  switch (Number(roleId)) {
    case ROLE.ALUMNI:  return 'Alumni';
    case ROLE.FACULTY: return 'Faculty';
    case ROLE.ADMIN:   return 'Program Chair';
    case ROLE.STUDENT: return 'Student';
    default:           return null;
  }
}

// ── GET /community — the feed, paginated ────────────────────────────────────
router.get('/community', apiAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = 10;
    const offset = (page - 1) * perPage;
    const subjectId = req.query.subject_id ? Number(req.query.subject_id) : null;

    const where = subjectId ? 'WHERE cp.subject_id = ?' : '';
    const params = subjectId ? [subjectId] : [];

    const totalRow = await one(`SELECT COUNT(*) c FROM community_posts cp ${where}`, params);
    const total = Number(totalRow?.c ?? 0);

    const rows = await q(
      `SELECT cp.*,
              u.first_name, u.last_name, u.role_id, u.profile_photo,
              s.code AS subject_code,
              (SELECT COUNT(*) FROM community_post_likes l WHERE l.community_post_id = cp.id) likes_count,
              (SELECT COUNT(*) FROM community_replies r WHERE r.post_id = cp.id) replies_count,
              (SELECT COUNT(*) FROM community_post_likes l WHERE l.community_post_id = cp.id AND l.user_id = ?) liked_by_me
         FROM community_posts cp
         LEFT JOIN users u ON u.id = cp.author_id
         LEFT JOIN subjects s ON s.id = cp.subject_id
         ${where}
        ORDER BY cp.is_pinned DESC, cp.created_at DESC
        LIMIT ? OFFSET ?`,
      [req.user.id, ...params, perPage, offset]
    );

    const ids = rows.map((r) => r.id);
    const attachments = ids.length
      ? await q(
          `SELECT * FROM community_post_attachments WHERE community_post_id IN (${ids.map(() => '?').join(',')})`,
          ids
        )
      : [];
    const byPost = new Map();
    for (const a of attachments) {
      if (!byPost.has(Number(a.community_post_id))) byPost.set(Number(a.community_post_id), []);
      byPost.get(Number(a.community_post_id)).push({
        id: a.id,
        original_name: a.original_name,
        file_category: a.file_category,
        human_size: humanSize(a.file_size),
        url: fileUrl(req, a.file_path),
      });
    }

    const posts = rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      post_type: r.post_type,
      is_pinned: Boolean(r.is_pinned),
      subject_code: r.subject_code,
      author_name: authorName(r),
      author_role: roleLabel(r.role_id),
      author_photo: r.profile_photo ? fileUrl(req, r.profile_photo) : null,
      created_at: toIso(r.created_at),
      created_on: fmtDay(r.created_at),
      likes_count: Number(r.likes_count),
      replies_count: Number(r.replies_count),
      liked_by_me: Number(r.liked_by_me) > 0,
      attachments: byPost.get(Number(r.id)) ?? [],
    }));

    res.json({
      posts,
      page,
      last_page: Math.max(1, Math.ceil(total / perPage)),
      total,
      can_post: canPost(req.user),
    });
  } catch (err) { next(err); }
});

// ── POST /community/posts/:id/like — toggle ─────────────────────────────────
router.post('/community/posts/:id(\\d+)/like', apiAuth, async (req, res, next) => {
  try {
    const postId = Number(req.params.id);
    const post = await one('SELECT id FROM community_posts WHERE id = ?', [postId]);
    if (!post) return res.status(404).json({ message: 'Post not found.' });

    const existing = await one(
      'SELECT id FROM community_post_likes WHERE community_post_id = ? AND user_id = ?',
      [postId, req.user.id]
    );

    if (existing) {
      await q('DELETE FROM community_post_likes WHERE id = ?', [existing.id]);
    } else {
      await q(
        'INSERT INTO community_post_likes (community_post_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)',
        [postId, req.user.id, nowSql(), nowSql()]
      );
    }

    const countRow = await one(
      'SELECT COUNT(*) c FROM community_post_likes WHERE community_post_id = ?',
      [postId]
    );

    res.json({ ok: true, liked: !existing, likes_count: Number(countRow?.c ?? 0) });
  } catch (err) { next(err); }
});

// ── GET /community/posts/:id/comments ───────────────────────────────────────
router.get('/community/posts/:id(\\d+)/comments', apiAuth, async (req, res, next) => {
  try {
    const postId = Number(req.params.id);
    const rows = await q(
      `SELECT r.*, u.first_name, u.last_name, u.role_id, u.profile_photo
         FROM community_replies r
         LEFT JOIN users u ON u.id = r.author_id
        WHERE r.post_id = ?
        ORDER BY r.created_at`,
      [postId]
    );

    res.json({
      comments: rows.map((r) => ({
        id: r.id,
        body: r.body,
        author_name: authorName(r),
        author_role: roleLabel(r.role_id),
        author_photo: r.profile_photo ? fileUrl(req, r.profile_photo) : null,
        created_at: toIso(r.created_at),
        created_on: fmtDay(r.created_at),
        is_mine: Number(r.author_id) === Number(req.user.id),
      })),
    });
  } catch (err) { next(err); }
});

// ── POST /community/posts/:id/comments — anyone in the community may comment ─
router.post('/community/posts/:id(\\d+)/comments', apiAuth, async (req, res, next) => {
  try {
    const postId = Number(req.params.id);
    const post = await one('SELECT id FROM community_posts WHERE id = ?', [postId]);
    if (!post) return res.status(404).json({ message: 'Post not found.' });

    const body = String(req.body?.body ?? '').trim();
    if (!body) return res.status(422).json({ message: 'Write something first.' });
    if (body.length > 1000) return res.status(422).json({ message: 'Comments are limited to 1000 characters.' });

    const result = await q(
      'INSERT INTO community_replies (post_id, author_id, body, created_at) VALUES (?, ?, ?, ?)',
      [postId, req.user.id, body, nowSql()]
    );

    res.status(201).json({
      ok: true,
      comment: {
        id: result.insertId,
        body,
        author_name: authorName(req.user),
        author_role: roleLabel(req.user.role_id),
        author_photo: req.user.profile_photo ? fileUrl(req, req.user.profile_photo) : null,
        created_at: toIso(nowSql()),
        created_on: fmtDay(nowSql()),
        is_mine: true,
      },
    });
  } catch (err) { next(err); }
});

// ── DELETE /community/comments/:id — author only ────────────────────────────
router.delete('/community/comments/:id(\\d+)', apiAuth, async (req, res, next) => {
  try {
    const comment = await one('SELECT * FROM community_replies WHERE id = ?', [Number(req.params.id)]);
    if (!comment) return res.status(404).json({ message: 'Comment not found.' });
    if (Number(comment.author_id) !== Number(req.user.id)) {
      return res.status(403).json({ message: 'You can only delete your own comments.' });
    }

    await q('DELETE FROM community_replies WHERE id = ?', [comment.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── GET /community/resources — the resource library ─────────────────────────
router.get('/community/resources', apiAuth, async (req, res, next) => {
  try {
    const subjectId = req.query.subject_id ? Number(req.query.subject_id) : null;
    const search = String(req.query.search ?? '').trim();
    const sort = req.query.sort === 'popular' ? 'popular' : 'recent';

    const clauses = [];
    const params = [];
    if (subjectId) { clauses.push('cr.subject_id = ?'); params.push(subjectId); }
    if (search) {
      clauses.push('(cr.title LIKE ? OR cr.description LIKE ? OR cr.original_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const order = sort === 'popular' ? 'cr.downloads_count DESC, cr.created_at DESC' : 'cr.created_at DESC';

    const rows = await q(
      `SELECT cr.*, s.code AS subject_code, u.first_name, u.last_name, u.role_id
         FROM community_resources cr
         LEFT JOIN subjects s ON s.id = cr.subject_id
         LEFT JOIN users u ON u.id = cr.uploader_id
         ${where}
        ORDER BY ${order}
        LIMIT 100`,
      params
    );

    res.json({
      resources: rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        original_name: r.original_name,
        file_category: r.file_category,
        human_size: humanSize(r.file_size),
        downloads_count: Number(r.downloads_count),
        subject_code: r.subject_code,
        uploader_name: authorName(r),
        uploader_role: roleLabel(r.role_id),
        created_on: fmtDay(r.created_at),
        url: fileUrl(req, r.file_path),
      })),
    });
  } catch (err) { next(err); }
});

// ── POST /community/resources/:id/download — count the download ─────────────
// The file itself is fetched from the returned URL; this only records the hit
// so the library's "most downloaded" ordering stays accurate.
router.post('/community/resources/:id(\\d+)/download', apiAuth, async (req, res, next) => {
  try {
    const resource = await one('SELECT * FROM community_resources WHERE id = ?', [Number(req.params.id)]);
    if (!resource) return res.status(404).json({ message: 'Resource not found.' });

    await q('UPDATE community_resources SET downloads_count = downloads_count + 1 WHERE id = ?', [resource.id]);

    res.json({
      ok: true,
      url: fileUrl(req, resource.file_path),
      downloads_count: Number(resource.downloads_count) + 1,
    });
  } catch (err) { next(err); }
});

module.exports = { router };
