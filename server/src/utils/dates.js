// Date helpers. The DB stores local datetimes ('YYYY-MM-DD HH:MM:SS'), same
// convention as the Laravel web version running on the same machine.

const pad = (n) => String(n).padStart(2, '0');

function toSqlDateTime(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function toSqlDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const nowSql = () => toSqlDateTime(new Date());
const todaySql = () => toSqlDate(new Date());

// Parse a DB datetime/date string into a local-time Date.
function parseSql(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  const [datePart, timePart = '00:00:00'] = String(s).split(/[ T]/);
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh = 0, mm = 0, ss = 0] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, ss);
}

// 'YYYY-MM-DD HH:MM:SS' -> ISO-ish string every JS engine can parse.
function toIso(s) {
  if (!s) return null;
  return String(s).replace(' ', 'T');
}

function addDays(d, days) {
  const nd = new Date(d.getTime());
  nd.setDate(nd.getDate() + days);
  return nd;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// e.g. "Jun 28, 2026"
function fmtDay(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : parseSql(d);
  return `${MONTHS_SHORT[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
}

module.exports = {
  toSqlDateTime, toSqlDate, nowSql, todaySql, parseSql, toIso,
  addDays, startOfDay, fmtDay, MONTHS, MONTHS_SHORT,
};
