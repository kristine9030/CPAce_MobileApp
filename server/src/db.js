const mysql = require('mysql2/promise');
require('dotenv').config();

// dateStrings keeps DATETIME/DATE columns as plain strings so no timezone
// conversion happens between XAMPP's MariaDB and Node.
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cpace_db',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
  namedPlaceholders: true,
});

async function q(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function one(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] || null;
}

module.exports = { pool, q, one };
