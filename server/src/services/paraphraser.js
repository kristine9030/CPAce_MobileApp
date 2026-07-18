// Port of App\Services\QuestionParaphraser (web version).
// Deterministically varies the wording a student sees per session while the
// meaning (and therefore the answer) stays identical. The stored question is
// never modified.
const { crc32 } = require('../utils/crc32');

const SYNONYMS = [
  // multi-word phrases first (matched before the words they contain)
  ['is best described as', 'is best characterized as'],
  ['which of the following', 'which of these'],
  ['all of the following', 'each of the following'],
  ['none of the following', 'not one of the following'],
  ['the entry to', 'the journal entry to'],
  ['is computed as', 'is calculated as'],
  ['arises when', 'occurs when'],
  ['results when', 'happens when'],
  ['in lieu of', 'instead of'],
  ['in accordance with', 'consistent with'],
  ['with respect to', 'regarding'],
  ['as part of', 'as a component of'],
  ['in a period of', 'during a period of'],
  ['for purposes of', 'for the purpose of'],
  ['is required to', 'must'],
  ['refers to', 'pertains to'],
  ['is treated', 'is handled'],
  ['is recognized', 'is recorded'],
  ['is measured at', 'is carried at'],
  ['is presented', 'is shown'],
  ['is classified as', 'is categorized as'],
  ['gives rise to', 'creates'],
  // single words
  ['computed', 'calculated'],
  ['determine', 'identify'],
  ['yields', 'produces'],
  ['generally', 'typically'],
  ['primarily', 'mainly'],
  ['usually', 'ordinarily'],
  ['approximately', 'roughly'],
  ['amount', 'sum'],
  ['entity', 'company'],
  ['firm', 'business'],
  ['permitted', 'allowed'],
  ['prohibited', 'not allowed'],
  ['appropriate', 'proper'],
  ['incurred', 'sustained'],
  ['subsequent', 'later'],
];

const FRAMES = [
  [/^Which of the following (is|are|was|were) NOT\b/i, [
    'Which of the following $1 NOT',
    'Which of these $1 NOT',
    'Identify which of the following $1 NOT',
    'Among the options below, which $1 NOT',
    'Of the following, which $1 NOT',
  ]],
  [/^Which of the following\b/i, [
    'Which of the following',
    'Which of these',
    'Among the following, which',
    'Identify which of the following',
    'Of the choices below, which',
  ]],
  [/^Which\b/i, ['Which', 'Identify which', 'Determine which']],
  [/^What (is|are)\b/i, ['What $1', 'Identify what $1', 'Determine what $1']],
  [/^Under (the|a|an)\b/i, ['Under $1', 'Based on $1', 'According to $1', 'In line with $1']],
  [/^How (is|are|does|do)\b/i, ['How $1', 'In what way $1']],
  [/^An entity\b/i, ['An entity', 'A reporting entity', 'A company']],
];

function pick(seed, salt, n) {
  if (n <= 0) return 0;
  return ((crc32(String(seed) + '|' + salt) % n) + n) % n;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyFrame(text, seed) {
  for (const [pattern, options] of FRAMES) {
    if (pattern.test(text)) {
      const choice = options[pick(seed, 'frame', options.length)];
      return text.replace(pattern, choice);
    }
  }
  return text;
}

function applySynonyms(text, seed) {
  let i = 0;
  for (const [from, to] of SYNONYMS) {
    i++;
    if (pick(seed, 'syn' + i, 2) === 0) continue;
    const re = new RegExp('\\b' + escapeRegExp(from) + '\\b', 'i');
    text = text.replace(re, to);
  }
  return text;
}

function applyPrefix(text, seed, type) {
  const isStatement = text.endsWith(':');
  const startsInterrogative = /^(Which|What|How|When|Why|Where|Identify|Among|Of|Determine)\b/i.test(text);

  let options;
  if (type === 'true_false') {
    options = ['', 'True or False: ', 'Evaluate this statement: ', 'State whether this is true or false: '];
  } else if (isStatement && !startsInterrogative) {
    options = ['', 'Complete the statement: ', 'Choose the option that best completes: ', 'Fill in the blank: '];
  } else {
    return text;
  }

  const prefix = options[pick(seed, 'pre', options.length)];
  return prefix === '' ? text : prefix + text;
}

function rephrase(text, seed, type = 'mcq') {
  text = String(text).trim();
  text = applyFrame(text, seed);
  text = applySynonyms(text, seed);
  text = applyPrefix(text, seed, type);
  return text;
}

// question: { question_text, question_type }, variants: array of active variant_text
function forDisplay(question, variants, seed) {
  const original = String(question.question_text).trim();
  const stored = (variants || []).filter(Boolean);

  if (stored.length > 0) {
    const pool = [original, ...stored].filter((t) => t && t.length);
    return pool[pick(seed, 'variant', pool.length)];
  }

  return rephrase(original, seed, question.question_type);
}

module.exports = { forDisplay, rephrase, pick };
