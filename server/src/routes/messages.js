const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { q, one } = require('../db');
const { apiAuth } = require('../middleware/auth');

const router = express.Router();

// ── File upload setup ────────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'storage', 'chat-attachments');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXT = new Set([
  'pdf','doc','docx','ppt','pptx','xls','xlsx','csv','txt','rtf','odt',
  'jpg','jpeg','png','gif','webp',
  'zip','rar',
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
      cb(null, unique + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    if (ALLOWED_EXT.has(ext)) return cb(null, true);
    cb(new Error('File type not allowed.'));
  },
});

// ── File category mapper (mirrors Laravel Material::categoryFor) ──────────────
function categoryFor(ext) {
  ext = ext.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['doc','docx','rtf','odt'].includes(ext)) return 'word';
  if (['xls','xlsx','csv','ods'].includes(ext)) return 'excel';
  if (['ppt','pptx','odp'].includes(ext)) return 'powerpoint';
  if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) return 'image';
  if (['mp4','mov','avi','mkv','webm'].includes(ext)) return 'video';
  if (['zip','rar','7z','tar','gz'].includes(ext)) return 'archive';
  if (['txt','md'].includes(ext)) return 'text';
  return 'other';
}

// ── Format a message the same shape the web app returns ──────────────────────
function formatMessage(row, viewerId) {
  let attachment = null;
  if (row.file_path) {
    const meta = iconMeta(row.file_category);
    attachment = {
      url: `/api/messages/attachments/${row.id}/download`,
      name: row.original_name,
      size: humanSize(row.file_size),
      is_image: row.file_category === 'image',
      preview_url: row.file_category === 'image' ? `/storage/${row.file_path}` : null,
      icon: meta.icon,
      color: meta.color,
    };
  }
  return {
    id: row.id,
    body: row.body,
    sender_name: row.sender_name || 'User',
    sender_photo: row.sender_photo || null,
    is_mine: row.sender_id === viewerId,
    created_at: row.created_at,
    attachment,
  };
}

function iconMeta(category) {
  const map = {
    pdf:        { icon: 'fa-file-pdf', color: '#e2483d' },
    word:       { icon: 'fa-file-word', color: '#2b579a' },
    excel:      { icon: 'fa-file-excel', color: '#217346' },
    powerpoint: { icon: 'fa-file-powerpoint', color: '#d24726' },
    image:      { icon: 'fa-file-image', color: '#8e5bd0' },
    video:      { icon: 'fa-file-video', color: '#c0392b' },
    archive:    { icon: 'fa-file-zipper', color: '#e8910b' },
    text:       { icon: 'fa-file-lines', color: '#607d8b' },
  };
  return map[category] || { icon: 'fa-file', color: '#6b7280' };
}

function humanSize(bytes) {
  if (!bytes) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes, i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return (size < 10 && i > 0 ? size.toFixed(1) : Math.round(size)) + ' ' + units[i];
}

// ── Get IO instance (set in index.js) ────────────────────────────────────────
function getIo(req) {
  return req.app.get('io');
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /messages — Inbox: list user's conversations
// ─────────────────────────────────────────────────────────────────────────────
router.get('/messages', apiAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get all conversations the user belongs to
    const convos = await q(`
      SELECT c.id, c.type, c.name, c.is_default_group, c.created_by, c.updated_at,
             cp.joined_at, cp.last_read_at
      FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE cp.user_id = ?
      ORDER BY c.updated_at DESC
    `, [userId]);

    // Enrich each conversation with latest message + participant info + unread count
    const results = await Promise.all(convos.map(async (c) => {
      // Latest message
      const latest = await one(`
        SELECT m.id, m.body, m.sender_id, m.created_at, m.file_path, m.file_category,
               u.first_name, u.last_name
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = ?
        ORDER BY m.created_at DESC
        LIMIT 1
      `, [c.id]);

      // Participant count and other user info (for DMs)
      let displayName = c.name;
      let otherUser = null;
      let participantCount = 0;

      const participants = await q(`
        SELECT u.id, u.first_name, u.last_name, u.profile_photo
        FROM users u
        JOIN conversation_participants cp ON cp.user_id = u.id
        WHERE cp.conversation_id = ?
      `, [c.id]);

      participantCount = participants.length;

      if (c.type === 'direct') {
        otherUser = participants.find(p => p.id !== userId) || participants[0];
        displayName = otherUser ? `${otherUser.first_name} ${otherUser.last_name}` : 'Unknown';
      }

      // Unread count
      const unreadRow = await one(`
        SELECT COUNT(*) AS cnt
        FROM messages m
        WHERE m.conversation_id = ?
          AND m.sender_id != ?
          AND (? IS NULL OR m.created_at > ?)
      `, [c.id, userId, c.last_read_at, c.last_read_at]);

      return {
        id: c.id,
        type: c.type,
        name: displayName,
        is_default_group: !!c.is_default_group,
        created_by: c.created_by,
        updated_at: c.updated_at,
        participant_count: participantCount,
        other_user: otherUser ? {
          id: otherUser.id,
          name: `${otherUser.first_name} ${otherUser.last_name}`,
          profile_photo: otherUser.profile_photo,
        } : null,
        latest_message: latest ? {
          body: latest.file_category === 'image' ? '📷 Image' : (latest.file_path ? '📎 Attachment' : latest.body),
          sender_name: `${latest.first_name} ${latest.last_name}`,
          sender_id: latest.sender_id,
          created_at: latest.created_at,
        } : null,
        unread_count: unreadRow?.cnt || 0,
      };
    }));

    // Sort by latest activity
    results.sort((a, b) => {
      const aTime = a.latest_message?.created_at || a.updated_at || '';
      const bTime = b.latest_message?.created_at || b.updated_at || '';
      return bTime > aTime ? 1 : bTime < aTime ? -1 : 0;
    });

    res.json({ conversations: results });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /messages/:id — Get messages in a conversation + mark as read
// ─────────────────────────────────────────────────────────────────────────────
router.get('/messages/:id', apiAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const conversationId = Number(req.params.id);

    // Verify user is a participant
    const membership = await one(
      'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );
    if (!membership) return res.status(403).json({ message: 'Not a participant.' });

    // Mark as read
    await q(
      'UPDATE conversation_participants SET last_read_at = NOW() WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );

    // Get conversation info
    const convo = await one('SELECT * FROM conversations WHERE id = ?', [conversationId]);

    // Get participants
    const participants = await q(`
      SELECT u.id, u.first_name, u.last_name, u.profile_photo, u.role_id,
             cp.joined_at, cp.last_read_at
      FROM users u
      JOIN conversation_participants cp ON cp.user_id = u.id
      WHERE cp.conversation_id = ?
    `, [conversationId]);

    let displayName = convo.name;
    if (convo.type === 'direct') {
      const other = participants.find(p => p.id !== userId);
      displayName = other ? `${other.first_name} ${other.last_name}` : 'Unknown';
    }

    // Get messages with sender info
    const messages = await q(`
      SELECT m.id, m.body, m.sender_id, m.created_at,
             m.file_path, m.original_name, m.file_size, m.file_category,
             u.first_name AS sender_name, u.last_name AS sender_last,
             u.profile_photo AS sender_photo
      FROM messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC
    `, [conversationId]);

    res.json({
      conversation: {
        id: convo.id,
        type: convo.type,
        name: displayName,
        is_default_group: !!convo.is_default_group,
        created_by: convo.created_by,
      },
      participants: participants.map(p => ({
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        profile_photo: p.profile_photo,
        role_id: p.role_id,
      })),
      messages: messages.map(m => ({
        id: m.id,
        body: m.body,
        sender_name: `${m.sender_name} ${m.sender_last}`,
        sender_photo: m.sender_photo,
        sender_id: m.sender_id,
        is_mine: m.sender_id === userId,
        created_at: m.created_at,
        attachment: m.file_path ? {
          url: `/api/messages/attachments/${m.id}/download`,
          name: m.original_name,
          size: humanSize(m.file_size),
          is_image: m.file_category === 'image',
          preview_url: m.file_category === 'image' ? `/storage/${m.file_path}` : null,
          icon: iconMeta(m.file_category).icon,
          color: iconMeta(m.file_category).color,
        } : null,
      })),
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /messages/:id/send — Send a message
// ─────────────────────────────────────────────────────────────────────────────
router.post('/messages/:id/send', apiAuth, upload.single('file'), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const conversationId = Number(req.params.id);
    const body = (req.body.body || '').trim();
    const file = req.file;

    if (!body && !file) {
      return res.status(422).json({ message: 'A message needs text or a file.' });
    }
    if (body.length > 3000) {
      return res.status(422).json({ message: 'Message body must be 3000 characters or less.' });
    }

    // Verify participant
    const membership = await one(
      'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );
    if (!membership) return res.status(403).json({ message: 'Not a participant.' });

    // Create message
    let filePath = null, originalName = null, fileSize = null, fileCategory = null;
    if (file) {
      const ext = path.extname(file.originalname).toLowerCase().slice(1);
      filePath = `chat-attachments/${file.filename}`;
      originalName = file.originalname;
      fileSize = file.size;
      fileCategory = categoryFor(ext);
    }

    const result = await q(
      `INSERT INTO messages (conversation_id, sender_id, body, file_path, original_name, file_size, file_category, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [conversationId, userId, body || '', filePath, originalName, fileSize, fileCategory]
    );

    const insertedId = result.insertId;

    // Touch conversation
    await q('UPDATE conversations SET updated_at = NOW() WHERE id = ?', [conversationId]);

    // Mark sender as read
    await q(
      'UPDATE conversation_participants SET last_read_at = NOW() WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );

    // Fetch the full message row
    const msg = await one(`
      SELECT m.*, u.first_name AS sender_name, u.last_name AS sender_last, u.profile_photo AS sender_photo
      FROM messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.id = ?
    `, [insertedId]);

    const formatted = formatMessage({
      ...msg,
      sender_name: `${msg.sender_name} ${msg.sender_last}`,
    }, userId);

    // Emit via Socket.IO
    const io = getIo(req);
    if (io) {
      io.to(`conversation:${conversationId}`).emit('new-message', {
        conversation_id: conversationId,
        message: formatted,
      });
    }

    res.json({ message: formatted });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /messages/:id/poll?after_id=N — Poll for new messages
// ─────────────────────────────────────────────────────────────────────────────
router.get('/messages/:id/poll', apiAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const conversationId = Number(req.params.id);
    const afterId = Number(req.query.after_id) || 0;

    const membership = await one(
      'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );
    if (!membership) return res.status(403).json({ message: 'Not a participant.' });

    const messages = await q(`
      SELECT m.*, u.first_name AS sender_name, u.last_name AS sender_last, u.profile_photo AS sender_photo
      FROM messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ? AND m.id > ?
      ORDER BY m.created_at ASC
    `, [conversationId, afterId]);

    if (messages.length > 0) {
      await q(
        'UPDATE conversation_participants SET last_read_at = NOW() WHERE conversation_id = ? AND user_id = ?',
        [conversationId, userId]
      );
    }

    res.json({
      messages: messages.map(m => formatMessage({
        ...m,
        sender_name: `${m.sender_name} ${m.sender_last}`,
      }, userId)),
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /messages/start/direct — Start or resume a DM
// ─────────────────────────────────────────────────────────────────────────────
router.post('/messages/start/direct', apiAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const otherId = Number(req.body.user_id);

    if (!otherId || otherId === userId) {
      return res.status(422).json({ message: 'Invalid user.' });
    }

    // Check other user exists
    const otherUser = await one('SELECT id, first_name, last_name, profile_photo FROM users WHERE id = ?', [otherId]);
    if (!otherUser) return res.status(404).json({ message: 'User not found.' });

    // Check if direct conversation already exists between the two users
    const existing = await q(`
      SELECT c.id
      FROM conversations c
      WHERE c.type = 'direct'
        AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = c.id AND user_id = ?)
        AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = c.id AND user_id = ?)
    `, [userId, otherId]);

    let conversationId;

    if (existing.length > 0) {
      conversationId = existing[0].id;
    } else {
      // Create new DM
      const result = await q(
        `INSERT INTO conversations (type, name, is_default_group, created_by, created_at, updated_at)
         VALUES ('direct', NULL, 0, ?, NOW(), NOW())`,
        [userId]
      );
      conversationId = result.insertId;

      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await q(
        `INSERT INTO conversation_participants (conversation_id, user_id, joined_at, last_read_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [conversationId, userId, now, now]
      );
      await q(
        `INSERT INTO conversation_participants (conversation_id, user_id, joined_at, last_read_at, created_at, updated_at)
         VALUES (?, ?, ?, NULL, NOW(), NOW())`,
        [conversationId, otherId, now]
      );
    }

    // Fetch messages
    const messages = await q(`
      SELECT m.*, u.first_name AS sender_name, u.last_name AS sender_last, u.profile_photo AS sender_photo
      FROM messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC
    `, [conversationId]);

    // Mark as read
    await q(
      'UPDATE conversation_participants SET last_read_at = NOW() WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );

    res.json({
      conversation: {
        id: conversationId,
        type: 'direct',
        name: `${otherUser.first_name} ${otherUser.last_name}`,
      },
      messages: messages.map(m => formatMessage({
        ...m,
        sender_name: `${m.sender_name} ${m.sender_last}`,
      }, userId)),
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /messages/search-users — Search users for new message picker
// ─────────────────────────────────────────────────────────────────────────────
router.post('/messages/search-users', apiAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const search = (req.body.query || '').trim();

    let users;
    if (search.length > 0) {
      users = await q(`
        SELECT id, first_name, last_name, profile_photo
        FROM users
        WHERE id != ? AND is_active = 1
          AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)
        ORDER BY first_name
        LIMIT 30
      `, [userId, `%${search}%`, `%${search}%`, `%${search}%`]);
    } else {
      users = await q(`
        SELECT id, first_name, last_name, profile_photo
        FROM users
        WHERE id != ? AND is_active = 1
        ORDER BY first_name
        LIMIT 50
      `, [userId]);
    }

    res.json({
      users: users.map(u => ({
        id: u.id,
        name: `${u.first_name} ${u.last_name}`,
        profile_photo: u.profile_photo,
      })),
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /messages/attachments/:id/download — Download a shared file
// ─────────────────────────────────────────────────────────────────────────────
router.get('/messages/attachments/:id/download', apiAuth, async (req, res, next) => {
  try {
    const msg = await one('SELECT * FROM messages WHERE id = ?', [Number(req.params.id)]);
    if (!msg || !msg.file_path) return res.status(404).json({ message: 'Not found.' });

    // Verify the requester is a participant
    const membership = await one(
      'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
      [msg.conversation_id, req.user.id]
    );
    if (!membership) return res.status(403).json({ message: 'Not a participant.' });

    const filePath = path.join(UPLOAD_DIR, path.basename(msg.file_path));
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File not found.' });

    res.download(filePath, msg.original_name || 'attachment');
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /messages/unread-count — Quick unread badge count
// ─────────────────────────────────────────────────────────────────────────────
router.get('/messages/unread-count', apiAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;

    const row = await one(`
      SELECT COUNT(*) AS cnt
      FROM messages m
      JOIN conversation_participants cp
        ON cp.conversation_id = m.conversation_id
        AND cp.user_id = ?
      WHERE m.sender_id != ?
        AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
    `, [userId, userId]);

    res.json({ unread_count: row?.cnt || 0 });
  } catch (err) { next(err); }
});

module.exports = { router };
