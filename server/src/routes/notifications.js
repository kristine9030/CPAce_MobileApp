// Notifications for the dashboard bell, backed by the notifications table.
const express = require('express');
const { q } = require('../db');
const { apiAuth } = require('../middleware/auth');
const { toIso } = require('../utils/dates');

const router = express.Router();

router.get('/notifications', apiAuth, async (req, res, next) => {
  try {
    const rows = await q(
      'SELECT id, type, title, message, is_read, created_at FROM notifications WHERE recipient_id = ? ORDER BY created_at DESC LIMIT 30',
      [req.user.id]
    );

    const notifications = rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.message ?? '',
      created_at: toIso(r.created_at),
      read: Boolean(r.is_read),
    }));

    res.json({
      notifications,
      unread_count: notifications.filter((n) => !n.read).length,
    });
  } catch (err) { next(err); }
});

router.post('/notifications/read-all', apiAuth, async (req, res, next) => {
  try {
    await q('UPDATE notifications SET is_read = 1 WHERE recipient_id = ?', [req.user.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Mark one notification read — scoped to the recipient so a guessed id can't
// touch somebody else's row.
router.post('/notifications/:id(\\d+)/read', apiAuth, async (req, res, next) => {
  try {
    const result = await q(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient_id = ?',
      [Number(req.params.id), req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Notification not found.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = { router };
