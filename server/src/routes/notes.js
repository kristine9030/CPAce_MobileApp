// Review notes CRUD, mirroring the web version's ReviewNoteApiController.
const express = require('express');
const { q, one } = require('../db');
const { apiAuth } = require('../middleware/auth');
const { nowSql, fmtDay } = require('../utils/dates');
const aiNoteQuiz = require('../services/aiNoteQuiz');

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
    is_archived: note.archived_at !== null,
    is_trashed: note.deleted_at !== null,
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

// view=active (default) | archived | trash. Archived and trashed notes stay
// out of the main list so the workspace only shows what the student is
// actually working on, matching the web version's tabs.
const VIEW_FILTERS = {
  active:   'deleted_at IS NULL AND archived_at IS NULL',
  archived: 'deleted_at IS NULL AND archived_at IS NOT NULL',
  trash:    'deleted_at IS NOT NULL',
};

router.get('/review-notes', apiAuth, async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const view = VIEW_FILTERS[req.query.view] ? String(req.query.view) : 'active';

    const rows = await q(
      `SELECT * FROM review_notes WHERE student_id = ? AND ${VIEW_FILTERS[view]} ORDER BY created_at DESC`,
      [studentId]
    );

    // Tab badge counts, so switching views never shows a stale number.
    const counts = await one(
      `SELECT
         SUM(deleted_at IS NULL AND archived_at IS NULL) active,
         SUM(deleted_at IS NULL AND archived_at IS NOT NULL) archived,
         SUM(deleted_at IS NOT NULL) trash
       FROM review_notes WHERE student_id = ?`,
      [studentId]
    );

    const data = [];
    for (const n of rows) data.push(await present(n));

    res.json({
      data,
      view,
      counts: {
        active:   Number(counts?.active ?? 0),
        archived: Number(counts?.archived ?? 0),
        trash:    Number(counts?.trash ?? 0),
      },
      current_page: 1,
      last_page: 1,
      total: data.length,
    });
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

// Soft-delete by default so a mis-tap is recoverable from the Trash tab.
// ?force=1 (or deleting something already in the trash) removes it for good.
router.delete('/review-notes/:id(\\d+)', apiAuth, async (req, res, next) => {
  try {
    const note = await ownedNote(Number(req.params.id), req.user.id);
    if (!note) return res.status(404).json({ message: 'Note not found.' });

    const force = String(req.query.force) === '1' || String(req.query.force) === 'true';

    if (force || note.deleted_at !== null) {
      await q('DELETE FROM review_notes WHERE id = ?', [note.id]);
      return res.json({ ok: true, permanent: true });
    }

    await q('UPDATE review_notes SET deleted_at = ? WHERE id = ?', [nowSql(), note.id]);
    res.json({ ok: true, permanent: false });
  } catch (err) { next(err); }
});

// Toggle archived. Archiving clears nothing — the note just moves tabs.
router.post('/review-notes/:id(\\d+)/archive', apiAuth, async (req, res, next) => {
  try {
    const note = await ownedNote(Number(req.params.id), req.user.id);
    if (!note) return res.status(404).json({ message: 'Note not found.' });

    const next_ = note.archived_at ? null : nowSql();
    await q('UPDATE review_notes SET archived_at = ? WHERE id = ?', [next_, note.id]);

    res.json({ ok: true, is_archived: next_ !== null });
  } catch (err) { next(err); }
});

// Pull a note back out of the trash.
router.post('/review-notes/:id(\\d+)/restore', apiAuth, async (req, res, next) => {
  try {
    const note = await ownedNote(Number(req.params.id), req.user.id);
    if (!note) return res.status(404).json({ message: 'Note not found.' });

    await q('UPDATE review_notes SET deleted_at = NULL WHERE id = ?', [note.id]);
    const fresh = await one('SELECT * FROM review_notes WHERE id = ?', [note.id]);

    res.json({ ok: true, note: await present(fresh) });
  } catch (err) { next(err); }
});

// Build a short practice quiz from the note's own content.
router.post('/review-notes/:id(\\d+)/quiz', apiAuth, async (req, res, next) => {
  try {
    const note = await ownedNote(Number(req.params.id), req.user.id);
    if (!note) return res.status(404).json({ message: 'Note not found.' });

    let subjectName = null;
    let topicName = null;
    if (note.subject_id) {
      subjectName = (await one('SELECT name FROM subjects WHERE id = ?', [note.subject_id]))?.name ?? null;
    }
    if (note.topic_id) {
      topicName = (await one('SELECT name FROM topics WHERE id = ?', [note.topic_id]))?.name ?? null;
    }

    const questions = await aiNoteQuiz.generate({
      title: note.title,
      content: note.content,
      subjectName,
      topicName,
      count: req.body?.count,
    });

    res.json({ note_id: note.id, title: note.title, questions });
  } catch (err) {
    // A too-short note is the student's to fix; anything else is the provider
    // being unavailable, which shouldn't read like the note was rejected.
    if (err.status === 422) return res.status(422).json({ message: err.message });

    console.error('[note-quiz] generation failed:', err.message);
    res.status(503).json({ message: 'The AI could not build a quiz right now. Please try again in a moment.' });
  }
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
