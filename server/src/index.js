require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { one } = require('./db');
const { createSocketServer } = require('./socket');

const app = express();
const server = http.createServer(app);

// Attach Socket.IO
const io = createSocketServer(server);
app.set('io', io);

app.use(cors());
app.use(express.json());

// Serve uploaded chat attachments
app.use('/storage', express.static(path.join(__dirname, '..', 'storage')));

app.get('/api/health', async (req, res) => {
  try {
    await one('SELECT 1 AS ok');
    res.json({ ok: true, db: true });
  } catch (e) {
    res.status(500).json({ ok: false, db: false, error: e.message });
  }
});

app.use('/api', require('./routes/auth').router);
app.use('/api', require('./routes/dashboard').router);
app.use('/api', require('./routes/subjects').router);
app.use('/api', require('./routes/quizzes').router);
app.use('/api', require('./routes/performance').router);
app.use('/api', require('./routes/notes').router);
app.use('/api', require('./routes/calendar').router);
app.use('/api', require('./routes/notifications').router);
app.use('/api', require('./routes/aiTutor').router);
app.use('/api', require('./routes/messages').router);

app.use((req, res) => res.status(404).json({ message: 'Not found.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Server error. Please try again.' });
});

const PORT = Number(process.env.PORT || 4000);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`CPAce mobile backend running on http://0.0.0.0:${PORT} (db: ${process.env.DB_NAME || 'cpace_db'})`);
});
