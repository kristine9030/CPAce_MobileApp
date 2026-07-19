// CPAce AI Tutor chat endpoint — own backend, independent from the web app.
const express = require('express');
const { apiAuth } = require('../middleware/auth');
const aiTutor = require('../services/aiTutor');
const userContext = require('../services/userContext');

const router = express.Router();

// Simple in-memory rate limit: 20 requests/minute per user (mirrors the web app's throttle).
const hits = new Map();
function rateLimited(userId) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const list = (hits.get(userId) || []).filter((t) => t > windowStart);
  list.push(now);
  hits.set(userId, list);
  return list.length > 20;
}

function validateMessages(body) {
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 30) {
    return { error: 'messages must be an array of 1–30 items.' };
  }
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) {
      return { error: 'Each message needs role "user" or "assistant".' };
    }
    if (typeof m.content !== 'string' || !m.content.trim() || m.content.length > 6000) {
      return { error: 'Each message needs non-empty content up to 6000 characters.' };
    }
  }
  return { data: messages.map((m) => ({ role: m.role, content: m.content })) };
}

router.post('/ai-tutor/chat', apiAuth, async (req, res) => {
  if (rateLimited(req.user.id)) {
    return res.status(429).json({ ok: false, message: 'Too many requests. Please wait a moment.' });
  }

  const { data: messages, error } = validateMessages(req.body);
  if (error) return res.status(422).json({ ok: false, message: error });

  let contextText;
  try {
    const ctx = await userContext.getContext(req.user.id);
    contextText = userContext.formatForPrompt(ctx);
  } catch (err) {
    console.error('[ai-tutor] failed to load user context, answering without it:', err.message);
  }

  try {
    const { reply, provider } = await aiTutor.chat(messages, contextText);
    res.json({ ok: true, reply, provider });
  } catch (err) {
    console.error('[ai-tutor] chat failed:', err.message);
    res.status(503).json({ ok: false, message: 'AI Tutor is temporarily unavailable. Please try again shortly.' });
  }
});

module.exports = { router };
