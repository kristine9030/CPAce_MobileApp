// Review notes CRUD, mirroring the web version's ReviewNoteApiController.
const express = require('express');
const { q, one } = require('../db');
const { apiAuth } = require('../middleware/auth');
const { nowSql, fmtDay } = require('../utils/dates');

const router = express.Router();

async function present(note) {
  let subjectCode = null;
  let topicName = null;
  if (note.subject_id) {
    const s = await one('SELECT code FROM subjects WHERE id = ?', [note.subject_id]);
    subjectCode = s?.code ?? null;
  }
  if (note.topic_id) {
    const t = await one('SELECT name FROM topics WHERE id = ?', [note.topic_id]);
    topicName = t?.name ?? null;
  }
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    subject_id: note.subject_id,
    subject_code: subjectCode,
    topic_id: note.topic_id,
    topic_name: topicName,
    tags: note.tags,
    is_favorite: Boolean(note.is_favorite),
    review_count: Number(note.review_count) || 0,
    created_on: fmtDay(note.created_at),
  };
}

function validateNote(body) {
  const title = String(body?.title ?? '').trim();
  if (!title) return { error: 'Title is required.' };
  if (title.length > 180) return { error: 'Title may not be longer than 180 characters.' };

  let tags = body?.tags != null ? String(body.tags) : null;
  if (tags) {
    tags = tags.split(',').map((t) => t.trim()).filter(Boolean).join(', ');
  }

  return {
    data: {
      title,
      content: body?.content != null ? String(body.content) : null,
      subject_id: body?.subject_id != null && body.subject_id !== '' ? Number(body.subject_id) : null,
      topic_id: body?.topic_id != null && body.topic_id !== '' ? Number(body.topic_id) : null,
      tags,
    },
  };
}

router.get('/review-notes', apiAuth, async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const rows = await q(
      'SELECT * FROM review_notes WHERE student_id = ? ORDER BY created_at DESC',
      [studentId]
    );
    const data = [];
    for (const n of rows) data.push(await present(n));
    res.json({ data, current_page: 1, last_page: 1, total: data.length });
  } catch (err) { next(err); }
});

router.post('/review-notes', apiAuth, async (req, res, next) => {
  try {
    const { data, error } = validateNote(req.body);
    if (error) return res.status(422).json({ message: error, errors: { title: [error] } });

    const now = nowSql();
    const result = await q(
      'INSERT INTO review_notes (student_id, subject_id, topic_id, title, content, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, data.subject_id, data.topic_id, data.title, data.content, data.tags, now, now]
    );
    const note = await one('SELECT * FROM review_notes WHERE id = ?', [result.insertId]);
    res.status(201).json({ ok: true, note: await present(note) });
  } catch (err) { next(err); }
});

async function ownedNote(id, studentId) {
  return one('SELECT * FROM review_notes WHERE id = ? AND student_id = ?', [id, studentId]);
}

router.get('/review-notes/:id(\\d+)', apiAuth, async (req, res, next) => {
  try {
    const note = await ownedNote(Number(req.params.id), req.user.id);
    if (!note) return res.status(404).json({ message: 'Note not found.' });

    if (String(req.query.read) === '1' || String(req.query.read) === 'true') {
      await q('UPDATE review_notes SET review_count = review_count + 1, last_reviewed_at = ? WHERE id = ?', [nowSql(), note.id]);
    }
    const fresh = await one('SELECT * FROM review_notes WHERE id = ?', [note.id]);
    res.json({ ok: true, note: await present(fresh) });
  } catch (err) { next(err); }
});

router.put('/review-notes/:id(\\d+)', apiAuth, async (req, res, next) => {
  try {
    const note = await ownedNote(Number(req.params.id), req.user.id);
    if (!note) return res.status(404).json({ message: 'Note not found.' });

    const { data, error } = validateNote(req.body);
    if (error) return res.status(422).json({ message: error, errors: { title: [error] } });

    await q(
      'UPDATE review_notes SET title = ?, content = ?, subject_id = ?, topic_id = ?, tags = ?, updated_at = ? WHERE id = ?',
      [data.title, data.content, data.subject_id, data.topic_id, data.tags, nowSql(), note.id]
    );
    const fresh = await one('SELECT * FROM review_notes WHERE id = ?', [note.id]);
    res.json({ ok: true, note: await present(fresh) });
  } catch (err) { next(err); }
});

router.delete('/review-notes/:id(\\d+)', apiAuth, async (req, res, next) => {
  try {
    const note = await ownedNote(Number(req.params.id), req.user.id);
    if (!note) return res.status(404).json({ message: 'Note not found.' });
    await q('DELETE FROM review_notes WHERE id = ?', [note.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/review-notes/:id(\\d+)/favorite', apiAuth, async (req, res, next) => {
  try {
    const note = await ownedNote(Number(req.params.id), req.user.id);
    if (!note) return res.status(404).json({ message: 'Note not found.' });
    const newValue = note.is_favorite ? 0 : 1;
    await q('UPDATE review_notes SET is_favorite = ? WHERE id = ?', [newValue, note.id]);
    res.json({ ok: true, is_favorite: Boolean(newValue) });
  } catch (err) { next(err); }
});

module.exports = { router };
