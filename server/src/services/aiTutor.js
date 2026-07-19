// CPAce AI Tutor — Gemini primary, OpenRouter fallback.
// Independent from the web app's Laravel implementation; talks to the same
// providers directly over REST (no SDK) using Node's built-in fetch.

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODELS = String(process.env.OPENROUTER_MODELS || '')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

// Gemini is put on a short cooldown after a failure so a bad key/quota
// doesn't add latency to every request while it's down.
let geminiDownUntil = 0;

function systemPrompt(userContextText) {
  const base = [
    'You are the CPAce AI Tutor, an assistant embedded in the CPAce mobile app for Philippine CPA board exam reviewees.',
    'Covered subjects: FAR, AFAR, AUD, TAX, RFBT, MS.',
    'Answer concisely (roughly 250 words or fewer), exam-focused, and reference PFRS/PAS/PSA/NIRC where relevant.',
    'Use simple markdown only (headings, short bullet lists, **bold**, `code`). No tables.',
    'If asked something outside CPA review or outside the student\'s own CPAce account/performance/notes (e.g. general knowledge, coding, current events, casual chat), still answer it helpfully and accurately — do not refuse.',
    'In that case, briefly note once, in one short sentence, that you are primarily built for CPA review inside CPAce so this is outside your main scope, then give the actual answer anyway. Do not repeat that disclaimer on every message in a row about the same off-topic subject — mention it only the first time it comes up in the conversation.',
  ].join(' ');

  if (!userContextText) return base;
  return `${base}\n\n${userContextText}`;
}

function toGeminiContents(messages) {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

async function callGemini(messages, userContextText) {
  if (!GEMINI_KEY) throw new Error('Gemini not configured.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt(userContextText) }] },
      contents: toGeminiContents(messages),
      generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
    }),
  });

  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);

  const json = await res.json();
  const reply = json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  if (!reply.trim()) throw new Error('Gemini returned an empty reply.');
  return reply;
}

async function callOpenRouter(messages, userContextText) {
  if (!OPENROUTER_KEY || OPENROUTER_MODELS.length === 0) throw new Error('OpenRouter not configured.');

  const chatMessages = [{ role: 'system', content: systemPrompt(userContextText) }, ...messages];
  let lastErr;

  for (const model of OPENROUTER_MODELS) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENROUTER_KEY}`,
          'HTTP-Referer': 'https://cpace.app',
          'X-Title': 'CPAce Mobile AI Tutor',
        },
        body: JSON.stringify({ model, messages: chatMessages, temperature: 0.4, max_tokens: 4096 }),
      });

      if (!res.ok) throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);

      const json = await res.json();
      const reply = json?.choices?.[0]?.message?.content || '';
      if (!reply.trim()) throw new Error('OpenRouter returned an empty reply.');
      return reply;
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('All OpenRouter models failed.');
}

async function chat(messages, userContextText) {
  if (Date.now() > geminiDownUntil) {
    try {
      const reply = await callGemini(messages, userContextText);
      return { reply, provider: 'gemini' };
    } catch (err) {
      geminiDownUntil = Date.now() + 5 * 60 * 1000;
      console.error('[ai-tutor] Gemini failed, falling back to OpenRouter:', err.message);
    }
  }

  const reply = await callOpenRouter(messages, userContextText);
  return { reply, provider: 'openrouter' };
}

module.exports = { chat };
