// Auth + profile, mirroring the web version's AuthApiController.
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { q, one } = require('../db');
const { apiAuth } = require('../middleware/auth');
const { nowSql, toSqlDateTime, addDays, parseSql } = require('../utils/dates');
const { sendResetCode } = require('../services/mailer');

const router = express.Router();

// Lazily ensure the reset-code table exists (cpace_db is otherwise managed by
// the Laravel web migrations, so we create our own small table on demand).
let resetTableReady = false;
async function ensureResetTable() {
  if (resetTableReady) return;
  await q(`CREATE TABLE IF NOT EXISTS password_reset_codes (
    email VARCHAR(191) NOT NULL PRIMARY KEY,
    code VARCHAR(10) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL
  )`);
  resetTableReady = true;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function userPayload(user) {
  const profile = await one('SELECT * FROM student_profiles WHERE user_id = ?', [user.id]);
  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    name: `${user.first_name} ${user.last_name}`,
    email: user.email,
    profile_photo: user.profile_photo,
    streak_days: Number(profile?.streak_days ?? 0),
    total_points: Number(profile?.total_points ?? 0),
    exam_target_date: profile?.exam_target_date ?? null,
  };
}

async function generateToken(userId) {
  const token = crypto.randomBytes(64).toString('hex');
  const now = nowSql();
  await q(
    'INSERT INTO api_tokens (user_id, token, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [userId, token, toSqlDateTime(addDays(new Date(), 30)), now, now]
  );
  return token;
}

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(422).json({ message: 'Email and password are required.', errors: { email: ['Email and password are required.'] } });
    }

    const user = await one('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || !bcrypt.compareSync(String(password), String(user.password).replace(/^\$2y\$/, '$2b$'))) {
      return res.status(422).json({
        message: 'These credentials do not match our records.',
        errors: { email: ['These credentials do not match our records.'] },
      });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: 'Your account has been deactivated.' });
    }

    // role_id 2 = student (mobile access is students only, same as web API)
    if (Number(user.role_id) !== 2) {
      return res.status(403).json({ message: 'Mobile access is for students only.' });
    }

    await q('UPDATE users SET last_login_at = ? WHERE id = ?', [nowSql(), user.id]);

    const token = await generateToken(user.id);
    res.json({ token, user: await userPayload(user) });
  } catch (err) { next(err); }
});

router.post('/signup', async (req, res, next) => {
  try {
    const { first_name, last_name, email, password, password_confirmation } = req.body || {};

    const errors = {};
    if (!first_name || String(first_name).length > 100) errors.first_name = ['First name is required.'];
    if (!last_name || String(last_name).length > 100) errors.last_name = ['Last name is required.'];
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) errors.email = ['A valid email is required.'];
    if (!password || String(password).length < 8) errors.password = ['Password must be at least 8 characters.'];
    else if (password !== password_confirmation) errors.password = ['Password confirmation does not match.'];

    if (Object.keys(errors).length) {
      return res.status(422).json({ message: Object.values(errors)[0][0], errors });
    }

    const existing = await one('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(422).json({ message: 'The email has already been taken.', errors: { email: ['The email has already been taken.'] } });
    }

    const hash = bcrypt.hashSync(String(password), 12);
    const now = nowSql();
    const result = await q(
      'INSERT INTO users (role_id, first_name, last_name, email, password, created_at, updated_at) VALUES (2, ?, ?, ?, ?, ?, ?)',
      [first_name, last_name, email, hash, now, now]
    );
    const userId = result.insertId;
    await q('INSERT INTO student_profiles (user_id) VALUES (?)', [userId]);

    const user = await one('SELECT * FROM users WHERE id = ?', [userId]);
    const token = await generateToken(userId);
    res.status(201).json({ token, user: await userPayload(user) });
  } catch (err) { next(err); }
});

// ── Forgot password: email a 6-digit code ────────────────────────────────
router.post('/forgot-password', async (req, res, next) => {
  try {
    await ensureResetTable();
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return res.status(422).json({ message: 'A valid email is required.', errors: { email: ['A valid email is required.'] } });
    }

    const user = await one('SELECT id, role_id, is_active FROM users WHERE email = ?', [email]);
    const generic = { message: 'If an account with that email exists, a reset code has been sent.' };

    // Only send to real, active student accounts (mobile is students only).
    if (!user || Number(user.role_id) !== 2 || !user.is_active) {
      return res.json(generic);
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = toSqlDateTime(new Date(Date.now() + 15 * 60 * 1000));
    await q('DELETE FROM password_reset_codes WHERE email = ?', [email]);
    await q(
      'INSERT INTO password_reset_codes (email, code, expires_at, created_at) VALUES (?, ?, ?, ?)',
      [email, code, expires, nowSql()]
    );

    const { sent } = await sendResetCode(email, code);

    const payload = { ...generic };
    if (!sent) payload.dev_code = code; // SMTP not configured — allow local testing
    res.json(payload);
  } catch (err) { next(err); }
});

// ── Reset password: verify the code and set a new password ────────────────
router.post('/reset-password', async (req, res, next) => {
  try {
    await ensureResetTable();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();
    const { password, password_confirmation } = req.body || {};

    const errors = {};
    if (!EMAIL_RE.test(email)) errors.email = ['A valid email is required.'];
    if (!/^\d{6}$/.test(code)) errors.code = ['Enter the 6-digit code sent to your email.'];
    if (!password || String(password).length < 8) errors.password = ['Password must be at least 8 characters.'];
    else if (password !== password_confirmation) errors.password = ['Password confirmation does not match.'];
    if (Object.keys(errors).length) {
      return res.status(422).json({ message: Object.values(errors)[0][0], errors });
    }

    const row = await one('SELECT * FROM password_reset_codes WHERE email = ?', [email]);
    if (!row || String(row.code) !== code) {
      return res.status(422).json({ message: 'Invalid or expired code.', errors: { code: ['Invalid or expired code.'] } });
    }
    if (parseSql(row.expires_at) < new Date()) {
      await q('DELETE FROM password_reset_codes WHERE email = ?', [email]);
      return res.status(422).json({ message: 'This code has expired. Please request a new one.', errors: { code: ['This code has expired.'] } });
    }

    const hash = bcrypt.hashSync(String(password), 12);
    await q('UPDATE users SET password = ?, updated_at = ? WHERE email = ?', [hash, nowSql(), email]);
    await q('DELETE FROM password_reset_codes WHERE email = ?', [email]);

    res.json({ message: 'Your password has been reset. You can now sign in.' });
  } catch (err) { next(err); }
});

router.post('/logout', apiAuth, async (req, res, next) => {
  try {
    await q('DELETE FROM api_tokens WHERE token = ?', [req.token]);
    res.json({ message: 'Logged out.' });
  } catch (err) { next(err); }
});

router.get('/user', apiAuth, async (req, res, next) => {
  try {
    res.json({ user: await userPayload(req.user) });
  } catch (err) { next(err); }
});

// Mobile settings screen: update name + exam target date.
router.put('/profile', apiAuth, async (req, res, next) => {
  try {
    const { first_name, last_name, exam_target_date } = req.body || {};

    if (first_name != null || last_name != null) {
      await q('UPDATE users SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name) WHERE id = ?', [
        first_name != null ? String(first_name) : null,
        last_name != null ? String(last_name) : null,
        req.user.id,
      ]);
    }

    if (exam_target_date !== undefined) {
      const value = exam_target_date ? String(exam_target_date).slice(0, 10) : null;
      if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return res.status(422).json({ message: 'Exam date must be YYYY-MM-DD.', errors: { exam_target_date: ['Exam date must be YYYY-MM-DD.'] } });
      }
      const profile = await one('SELECT user_id FROM student_profiles WHERE user_id = ?', [req.user.id]);
      if (profile) {
        await q('UPDATE student_profiles SET exam_target_date = ? WHERE user_id = ?', [value, req.user.id]);
      } else {
        await q('INSERT INTO student_profiles (user_id, exam_target_date) VALUES (?, ?)', [req.user.id, value]);
      }
    }

    const user = await one('SELECT * FROM users WHERE id = ?', [req.user.id]);
    res.json({ ok: true, user: await userPayload(user) });
  } catch (err) { next(err); }
});

module.exports = { router, userPayload };
