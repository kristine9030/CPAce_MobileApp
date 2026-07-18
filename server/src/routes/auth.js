// Auth + profile, mirroring the web version's AuthApiController.
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { q, one } = require('../db');
const { apiAuth } = require('../middleware/auth');
const { nowSql, toSqlDateTime, addDays } = require('../utils/dates');

const router = express.Router();

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
