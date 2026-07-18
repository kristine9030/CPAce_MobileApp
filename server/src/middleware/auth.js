// Bearer-token auth, mirroring the web version's ApiAuthenticate middleware
// and api_tokens table (128-char hex token, 30-day expiry).
const { one } = require('../db');
const { parseSql } = require('../utils/dates');

async function apiAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const raw = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

    if (!raw) return res.status(401).json({ message: 'Unauthenticated.' });

    const record = await one('SELECT * FROM api_tokens WHERE token = ?', [raw]);
    if (!record) return res.status(401).json({ message: 'Unauthenticated.' });

    if (record.expires_at && parseSql(record.expires_at) < new Date()) {
      return res.status(401).json({ message: 'Unauthenticated.' });
    }

    const user = await one('SELECT * FROM users WHERE id = ?', [record.user_id]);
    if (!user) return res.status(401).json({ message: 'Unauthenticated.' });

    req.user = user;
    req.token = raw;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { apiAuth };
