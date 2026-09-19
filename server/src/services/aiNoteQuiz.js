// Turns a student's own review note into a short practice quiz, so they can
// check whether what they wrote down actually stuck.
//
// Grounding matters here: the questions must come from the note itself, not
// from the CPALE syllabus at large — otherwise the model quizzes them on
// material they never wrote down.
const { complete, parseJsonReply } = require('./aiTutor');

const MIN_QUESTIONS = 3;
const MAX_QUESTIONS = 10;
const MAX_NOTE_CHARS = 6000;
/** Below this, a note has too little substance to build real questions from. */
const MIN_NOTE_CHARS = 200;

const SYSTEM_PROMPT = [
  'You write short multiple-choice practice quizzes for Philippine CPA board exam reviewees using the CPAce app.',
  'You will be given ONE study note written by the student.',
  'Every question, every choice, and every explanation MUST be answerable from the note text alone.',
  'Do not introduce facts, standards, or figures that are not in the note.',
  'Each question has exactly 4 choices labelled A, B, C, D, with exactly one correct answer.',
  'Vary which label is correct across the quiz — do not make them all A.',
  'Explanations are one or two sentences and point back to what the note says.',
  '',
  'Respond with ONLY a JSON object in this exact shape, and no prose around it:',
  '{"questions":[{"question_text":"...","choices":[{"label":"A","text":"...","is_correct":false},{"label":"B","text":"...","is_correct":true},{"label":"C","text":"...","is_correct":false},{"label":"D","text":"...","is_correct":false}],"explanation":"..."}]}',
].join('\n');

/** Plain text length of a note, used to decide if it is worth quizzing on. */
function plainLength(content) {
  return String(content ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length;
}

function normalize(raw, wanted) {
  const list = Array.isArray(raw?.questions) ? raw.questions : Array.isArray(raw) ? raw : [];

  const questions = list
    .map((item) => {
      const text = String(item?.question_text ?? '').trim();
      const choices = Array.isArray(item?.choices) ? item.choices : [];
      if (!text || choices.length < 2) return null;

      const cleaned = choices
        .map((c, i) => ({
          label: String(c?.label ?? String.fromCharCode(65 + i)).trim().toUpperCase().slice(0, 1),
          text: String(c?.text ?? '').trim(),
          is_correct: c?.is_correct === true || c?.is_correct === 1,
        }))
        .filter((c) => c.text);

      // Exactly one correct answer, or the question is unusable.
      if (cleaned.filter((c) => c.is_correct).length !== 1) return null;

      return {
        question_text: text,
        choices: cleaned,
        explanation: String(item?.explanation ?? '').trim() || null,
      };
    })
    .filter(Boolean)
    .slice(0, wanted);

  if (questions.length === 0) throw new Error('The AI returned no usable questions.');
  return questions;
}

/**
 * Build a multiple-choice quiz from one note.
 * Throws with a student-facing message when the note is too thin to use.
 */
async function generate({ title, content, subjectName, topicName, count }) {
  const wanted = Math.max(MIN_QUESTIONS, Math.min(MAX_QUESTIONS, Number(count) || 5));

  if (plainLength(content) < MIN_NOTE_CHARS) {
    const err = new Error('This note is too short to build a quiz from. Add more detail to it first — around a paragraph or two.');
    err.status = 422;
    throw err;
  }

  const prompt = [
    `Note title: ${title}`,
    subjectName ? `Subject: ${subjectName}` : null,
    topicName ? `Topic: ${topicName}` : null,
    `Number of questions: ${wanted}`,
    '',
    '--- BEGIN NOTE ---',
    String(content).slice(0, MAX_NOTE_CHARS),
    '--- END NOTE ---',
    '',
    'Respond with ONLY the JSON object described in the system instructions.',
  ].filter((line) => line !== null).join('\n');

  const reply = await complete(SYSTEM_PROMPT, prompt);
  return normalize(parseJsonReply(reply), wanted);
}

module.exports = { generate, MIN_QUESTIONS, MAX_QUESTIONS, MIN_NOTE_CHARS };
