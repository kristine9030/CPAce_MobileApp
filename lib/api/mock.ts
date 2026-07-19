const delay = (ms = 350) => new Promise(r => setTimeout(r, ms));

const today = () => new Date();
// local-date string (yyyy-mm-dd) — toISOString() would shift a day in UTC+8
const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysBetween = (a: Date, b: Date) => Math.max(0, Math.ceil((b.getTime() - a.getTime()) / 86400000));

const USER = {
  id: 1,
  first_name: 'Juan',
  last_name: 'dela Cruz',
  name: 'Juan dela Cruz',
  email: 'juan@cpace.com',
  profile_photo: null as string | null,
  streak_days: 7,
  total_points: 420,
  exam_target_date: '2026-10-15',
};

const SUBJECTS = [
  { id: 1, code: 'FAR',  name: 'Financial Accounting & Reporting', description: 'Financial statements and PFRS standards.', color: '#A52020', icon: 'calculator',    question_count: 320, mastery: 68 },
  { id: 2, code: 'AFAR', name: 'Advanced Financial Accounting',    description: 'Partnerships, consolidations, and more.',  color: '#7B1416', icon: 'book',           question_count: 210, mastery: 45 },
  { id: 3, code: 'MAS',  name: 'Management Advisory Services',     description: 'Cost accounting and management tools.',   color: '#c0392b', icon: 'briefcase',       question_count: 280, mastery: 72 },
  { id: 4, code: 'AUD',  name: 'Auditing',                         description: 'Auditing theory and Philippine standards.', color: '#8e5bd0', icon: 'shield-checkmark', question_count: 250, mastery: 55 },
  { id: 5, code: 'TAX',  name: 'Taxation',                         description: 'NIRC, local taxes, and tax remedies.',    color: '#21a366', icon: 'document-text',   question_count: 300, mastery: 38 },
  { id: 6, code: 'BLaw', name: 'Business Law',                     description: 'Obligations, contracts, commercial law.', color: '#e8910b', icon: 'library',         question_count: 190, mastery: 61 },
];

// ─── Question bank (correct = index into options) ─────────────────────────────
interface BankQuestion {
  text: string;
  topic: string;
  subject_code: string;
  options: string[];
  correct: number;
  explanation: string;
}

const BANK: BankQuestion[] = [
  { text: 'A company purchases equipment for ₱500,000 with a useful life of 5 years and no residual value. Using straight-line depreciation, what is the annual depreciation?', topic: 'Depreciation', subject_code: 'FAR', options: ['₱100,000', '₱80,000', '₱125,000', '₱150,000'], correct: 0, explanation: 'Straight-line depreciation = (Cost − Residual value) ÷ Useful life = ₱500,000 ÷ 5 = ₱100,000 per year.' },
  { text: 'Under PAS 38, which of the following can be recognized as an intangible asset?', topic: 'Intangible Assets', subject_code: 'FAR', options: ['Internally generated goodwill', 'Customer lists developed internally', 'Purchased patent', 'Research costs'], correct: 2, explanation: 'PAS 38 prohibits recognizing internally generated goodwill, brands, and customer lists; a purchased patent meets the recognition criteria.' },
  { text: 'An auditor discovers that a client\'s internal controls are weak. Which audit risk component does this affect?', topic: 'Audit Risk', subject_code: 'AUD', options: ['Inherent risk', 'Control risk', 'Detection risk', 'Audit risk'], correct: 1, explanation: 'Control risk is the risk that a misstatement will not be prevented or detected by the entity\'s internal controls.' },
  { text: 'What is the income tax rate for domestic corporations under the CREATE Act?', topic: 'Corporate Tax', subject_code: 'TAX', options: ['30%', '25%', '20%', '15%'], correct: 1, explanation: 'The CREATE Act lowered the regular corporate income tax rate to 25% (20% for qualified small corporations).' },
  { text: 'A partner withdraws ₱50,000 from a partnership. How is this recorded?', topic: 'Partnership', subject_code: 'AFAR', options: ['Debit Cash, Credit Partner Capital', 'Debit Partner Drawings, Credit Cash', 'Debit Partner Capital, Credit Cash', 'Debit Expense, Credit Cash'], correct: 1, explanation: 'Withdrawals are charged to the partner\'s drawing account: debit Drawings, credit Cash.' },
  { text: 'Deferred tax liabilities arise from which type of temporary difference?', topic: 'Deferred Tax', subject_code: 'FAR', options: ['Deductible temporary differences', 'Taxable temporary differences', 'Permanent differences', 'Operating loss carryovers'], correct: 1, explanation: 'Taxable temporary differences result in taxable amounts in future periods, giving rise to deferred tax liabilities.' },
  { text: 'Which costing method assigns overhead based on activities that drive costs?', topic: 'Cost Accounting', subject_code: 'MAS', options: ['Job order costing', 'Process costing', 'Activity-based costing', 'Standard costing'], correct: 2, explanation: 'Activity-based costing (ABC) allocates overhead using cost drivers tied to specific activities.' },
  { text: 'The margin of safety is computed as:', topic: 'CVP Analysis', subject_code: 'MAS', options: ['Sales − Break-even sales', 'Sales − Variable costs', 'Fixed costs ÷ Contribution margin ratio', 'Contribution margin − Fixed costs'], correct: 0, explanation: 'Margin of safety = actual (or budgeted) sales minus break-even sales.' },
  { text: 'Which of the following is a substantive test?', topic: 'Audit Procedures', subject_code: 'AUD', options: ['Observing the client\'s inventory count procedures', 'Confirming accounts receivable with customers', 'Inquiring about segregation of duties', 'Reviewing the organizational chart'], correct: 1, explanation: 'Confirmation of receivables tests account balances directly — a substantive procedure. The others are tests of controls.' },
  { text: 'Value-added tax on the sale of goods in the Philippines is:', topic: 'VAT', subject_code: 'TAX', options: ['10%', '12%', '15%', '3%'], correct: 1, explanation: 'The standard VAT rate on sale of goods and services is 12%.' },
  { text: 'An obligation to give a determinate thing includes the obligation to deliver:', topic: 'Obligations', subject_code: 'BLaw', options: ['The thing only', 'The thing and its accessions and accessories', 'A substitute of equal value', 'The monetary equivalent'], correct: 1, explanation: 'Under the Civil Code, the obligation to give a determinate thing includes its accessions and accessories even if not mentioned.' },
  { text: 'A contract where consent is given through mistake, violence, intimidation, undue influence, or fraud is:', topic: 'Contracts', subject_code: 'BLaw', options: ['Void', 'Voidable', 'Rescissible', 'Unenforceable'], correct: 1, explanation: 'Vitiated consent makes a contract voidable — valid until annulled.' },
  { text: 'In a business combination, goodwill is measured as the excess of:', topic: 'Business Combinations', subject_code: 'AFAR', options: ['Consideration transferred over the fair value of net identifiable assets acquired', 'Book value of assets over liabilities', 'Fair value of assets over consideration transferred', 'Purchase price over the book value of equity'], correct: 0, explanation: 'Goodwill = consideration transferred (plus NCI) − fair value of net identifiable assets acquired.' },
  { text: 'Under PFRS 15, revenue is recognized when:', topic: 'Revenue Recognition', subject_code: 'FAR', options: ['Cash is received', 'The contract is signed', 'The entity satisfies a performance obligation', 'The invoice is issued'], correct: 2, explanation: 'PFRS 15\'s core principle: recognize revenue when (or as) the entity satisfies a performance obligation by transferring control.' },
  { text: 'Which budget is prepared first in the master budget process?', topic: 'Budgeting', subject_code: 'MAS', options: ['Production budget', 'Sales budget', 'Cash budget', 'Direct materials budget'], correct: 1, explanation: 'The sales budget drives all other operating budgets, so it is prepared first.' },
  { text: 'The auditor\'s report on financial statements provides:', topic: 'Audit Reports', subject_code: 'AUD', options: ['Absolute assurance', 'Reasonable assurance', 'Limited assurance', 'No assurance'], correct: 1, explanation: 'An audit provides reasonable — not absolute — assurance that the statements are free of material misstatement.' },
  { text: 'Individual taxpayers earning purely compensation income are taxed using:', topic: 'Income Taxation', subject_code: 'TAX', options: ['The 8% flat rate option', 'The graduated income tax table', 'A final withholding tax of 10%', 'The optional standard deduction'], correct: 1, explanation: 'Purely compensation earners use the graduated tax table; the 8% option applies only to self-employed/professionals.' },
  { text: 'Installment sales method recognizes gross profit:', topic: 'Installment Sales', subject_code: 'AFAR', options: ['At the point of sale', 'When cash is collected, in proportion to collections', 'At the end of the installment period', 'Only after cost is fully recovered'], correct: 1, explanation: 'Under the installment method, gross profit is recognized as cash is collected: collections × gross profit rate.' },
  { text: 'Petty cash shortages discovered during a cash count are debited to:', topic: 'Cash and Cash Equivalents', subject_code: 'FAR', options: ['Cash short or over', 'Petty cash fund', 'Miscellaneous income', 'Accounts receivable'], correct: 0, explanation: 'Shortages are debited to "Cash short or over" (an expense if not recovered from the custodian).' },
  { text: 'Which characteristic distinguishes a partnership from a corporation?', topic: 'Partnership', subject_code: 'BLaw', options: ['Separate juridical personality', 'Created by operation of law', 'Mutual agency among owners', 'Limited liability of all owners'], correct: 2, explanation: 'In a partnership, every partner is an agent of the firm (mutual agency); corporations act only through their board.' },
];

// ─── Quiz sessions (in-memory) ────────────────────────────────────────────────
interface SessionQuestion {
  item_number: number;
  question_id: number;
  question_text: string;
  question_type: string;
  options: Array<{ id: number; letter: string; text: string }>;
  correct_option_id: number;
  topic: string;
  explanation: string;
}

interface MockSession {
  session_id: number;
  mode: string;
  subject_id: number | null;
  time_limit: number | null;  // minutes
  questions: SessionQuestion[];
  started_at: string;
  results: any | null;
}

let sessionSeq = 100;
const sessions = new Map<number, MockSession>();

const LETTERS = ['A', 'B', 'C', 'D'];

function buildQuestions(count: number, subjectId: number | null): SessionQuestion[] {
  const code = subjectId ? SUBJECTS.find(s => s.id === subjectId)?.code : null;
  let pool = code ? BANK.filter(q => q.subject_code === code) : [...BANK];
  if (pool.length === 0) pool = [...BANK];
  // shuffle
  pool = pool.sort(() => Math.random() - 0.5);

  return Array.from({ length: count }, (_, i) => {
    const bq = pool[i % pool.length];
    const base = (i + 1) * 10;
    return {
      item_number: i + 1,
      question_id: i + 1,
      question_text: bq.text,
      question_type: 'multiple_choice',
      options: bq.options.map((text, j) => ({ id: base + j, letter: LETTERS[j], text })),
      correct_option_id: base + bq.correct,
      topic: bq.topic,
      explanation: bq.explanation,
    };
  });
}

function gradeSession(sess: MockSession, answers: Array<{ question_id: number; selected_option_id: number | null }>) {
  const byId = new Map(answers?.map(a => [a.question_id, a.selected_option_id]) ?? []);
  let correct = 0, skipped = 0;
  const topicMap = new Map<string, { correct: number; total: number }>();

  const details = sess.questions.map(q => {
    const sel = byId.get(q.question_id) ?? null;
    const isCorrect = sel === q.correct_option_id;
    if (sel === null) skipped++;
    if (isCorrect) correct++;
    const t = topicMap.get(q.topic) ?? { correct: 0, total: 0 };
    t.total++; if (isCorrect) t.correct++;
    topicMap.set(q.topic, t);
    return {
      item_number: q.item_number,
      question_text: q.question_text,
      your_answer: sel === null ? null : q.options.find(o => o.id === sel)?.text ?? null,
      correct_answer: q.options.find(o => o.id === q.correct_option_id)!.text,
      is_correct: isCorrect,
      explanation: q.explanation,
    };
  });

  const total = sess.questions.length;
  const scorePct = Math.round((correct / total) * 100);
  const points = correct * 10;
  const timeTaken = Math.min(
    Math.round((Date.now() - new Date(sess.started_at).getTime()) / 1000),
    (sess.time_limit ?? 60) * 60,
  );

  sess.results = {
    session_id: sess.session_id,
    mode: sess.mode,
    total_items: total,
    correct_answers: correct,
    incorrect_answers: total - correct - skipped,
    skipped_answers: skipped,
    score_percent: scorePct,
    points_earned: points,
    time_taken_seconds: timeTaken,
    passed: scorePct >= 75,
    by_topic: Array.from(topicMap, ([topic, t]) => ({ topic, correct: t.correct, total: t.total, accuracy: t.correct / t.total })),
    question_details: details,
  };

  // Reflect the finished quiz in user stats + history + dashboard
  USER.total_points += points;
  DASHBOARD.points = USER.total_points;
  DASHBOARD.questions_attempted += total;
  DASHBOARD.questions_this_week += total;
  const subjCode = sess.subject_id ? SUBJECTS.find(s => s.id === sess.subject_id)?.code ?? null : null;
  HISTORY.unshift({
    id: sess.session_id,
    mode: sess.mode,
    session_type: 'quiz',
    total_items: total,
    correct_answers: correct,
    score_percent: scorePct,
    started_at: sess.started_at,
    completed_at: new Date().toISOString(),
    subject_code: subjCode,
  });
}

// ─── Dashboard / history / performance ────────────────────────────────────────
const DASHBOARD = {
  streak: 7,
  points: USER.total_points,
  get days_to_exam() {
    return USER.exam_target_date ? daysBetween(today(), new Date(USER.exam_target_date)) : null;
  },
  questions_attempted: 312,
  questions_this_week: 48,
  study_hours: 24,
  study_hours_week: 6,
  readiness: 58,
  subject_mastery: SUBJECTS.map(s => ({ id: s.id, code: s.code, name: s.name, color: s.color, mastery: s.mastery })),
  weaknesses: [
    { topic: 'Deferred Tax',       subject_code: 'FAR', accuracy_rate: 0.32 },
    { topic: 'Installment Sales',  subject_code: 'FAR', accuracy_rate: 0.38 },
    { topic: 'Income Taxation',    subject_code: 'TAX', accuracy_rate: 0.41 },
  ],
  get recent_activity() { return HISTORY.slice(0, 3); },
};

interface HistoryRow {
  id: number; mode: string; session_type: string; total_items: number;
  correct_answers: number; score_percent: number;
  started_at: string; completed_at: string; subject_code: string | null;
}

const HISTORY: HistoryRow[] = [
  { id: 1, mode: 'adaptive',  session_type: 'quiz', total_items: 10, correct_answers: 8,  score_percent: 80, started_at: '2026-06-28T10:00:00Z', completed_at: '2026-06-28T10:15:00Z', subject_code: 'FAR'  },
  { id: 2, mode: 'topic',     session_type: 'quiz', total_items: 15, correct_answers: 9,  score_percent: 60, started_at: '2026-06-27T14:00:00Z', completed_at: '2026-06-27T14:20:00Z', subject_code: 'MAS'  },
  { id: 3, mode: 'timed',     session_type: 'quiz', total_items: 10, correct_answers: 6,  score_percent: 60, started_at: '2026-06-26T09:00:00Z', completed_at: '2026-06-26T09:12:00Z', subject_code: 'AUD'  },
  { id: 4, mode: 'challenge', session_type: 'quiz', total_items: 20, correct_answers: 14, score_percent: 70, started_at: '2026-06-25T16:00:00Z', completed_at: '2026-06-25T16:30:00Z', subject_code: null   },
];

// Canned results for seeded history rows that pre-date the grading engine.
const cannedResults = (id: number) => {
  const row = HISTORY.find(h => h.id === id);
  const total = row?.total_items ?? 10;
  const correct = row?.correct_answers ?? 7;
  const qs = buildQuestions(Math.min(total, 5), null);
  return {
    session_id: id,
    mode: row?.mode ?? 'adaptive',
    total_items: total,
    correct_answers: correct,
    incorrect_answers: total - correct,
    skipped_answers: 0,
    score_percent: row?.score_percent ?? 70,
    points_earned: correct * 10,
    time_taken_seconds: 210,
    passed: (row?.score_percent ?? 70) >= 75,
    by_topic: qs.map(q => ({ topic: q.topic, correct: 1, total: 1, accuracy: 1 })),
    question_details: qs.map(q => ({
      item_number: q.item_number,
      question_text: q.question_text,
      your_answer: q.options.find(o => o.id === q.correct_option_id)!.text,
      correct_answer: q.options.find(o => o.id === q.correct_option_id)!.text,
      is_correct: true,
      explanation: q.explanation,
    })),
  };
};

const PERFORMANCE = {
  overall_accuracy: 67.5,
  total_sessions: 12,
  total_questions: 312,
  average_score: 67.5,
  best_streak: 7,
  study_hours: 24,
  daily_series: Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return { date: toISO(d), questions: [20, 35, 15, 48, 30, 42, 25][i], accuracy: [65, 71, 60, 75, 68, 72, 80][i] };
  }),
  strengths: [
    { topic: 'Cash and Cash Equivalents', subject_code: 'FAR', accuracy_rate: 0.92, attempts: 24 },
    { topic: 'Standard Costing',          subject_code: 'MAS', accuracy_rate: 0.88, attempts: 17 },
    { topic: 'Audit Planning',            subject_code: 'AUD', accuracy_rate: 0.85, attempts: 20 },
  ],
  weaknesses: [
    { topic: 'Deferred Tax',      subject_code: 'FAR', accuracy_rate: 0.32, attempts: 19 },
    { topic: 'Installment Sales', subject_code: 'FAR', accuracy_rate: 0.38, attempts: 13 },
    { topic: 'Income Taxation',   subject_code: 'TAX', accuracy_rate: 0.41, attempts: 22 },
  ],
  by_subject: SUBJECTS.map(s => ({ subject_id: s.id, code: s.code, name: s.name, color: s.color, accuracy: s.mastery, sessions: Math.ceil(s.mastery / 12) })),
  by_quiz_type: [
    { mode: 'adaptive',  sessions: 5, avg_score: 74 },
    { mode: 'topic',     sessions: 4, avg_score: 65 },
    { mode: 'timed',     sessions: 2, avg_score: 60 },
    { mode: 'challenge', sessions: 1, avg_score: 70 },
  ],
};

// ─── Notes ────────────────────────────────────────────────────────────────────
interface MockNote { id: number; title: string; content: string; subject_id: number | null; subject_code: string | null; is_favorite: boolean; created_on: string; }

const fmtDay = (d: Date) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

let noteIdSeq = 4;
let notes: MockNote[] = [
  { id: 1, title: 'Deferred Tax Notes',   content: 'Deferred tax arises from temporary differences between accounting profit and taxable profit. Deferred tax asset = deductible temporary difference × tax rate.', subject_id: 1,    subject_code: 'FAR', is_favorite: true,  created_on: 'Jun 20, 2026' },
  { id: 2, title: 'Audit Risk Formula',   content: 'AR = IR × CR × DR\nThe auditor cannot control IR or CR — only detection risk (DR) is within the auditor\'s control through substantive procedures.', subject_id: 4,    subject_code: 'AUD', is_favorite: false, created_on: 'Jun 22, 2026' },
  { id: 3, title: 'VAT Summary (PH)',     content: '12% standard rate on sale of goods/services.\nExempt: raw agriculture, educational services, health services, exports (zero-rated).', subject_id: 5,    subject_code: 'TAX', is_favorite: true,  created_on: 'Jun 25, 2026' },
];

// ─── Calendar (generated for any requested month) ─────────────────────────────
const REVIEW_TOPICS = [
  { topic: 'Deferred Tax',        subject_code: 'FAR' },
  { topic: 'Audit Risk',          subject_code: 'AUD' },
  { topic: 'Revenue Recognition', subject_code: 'FAR' },
  { topic: 'Standard Costing',    subject_code: 'MAS' },
  { topic: 'Income Taxation',     subject_code: 'TAX' },
  { topic: 'Obligations',         subject_code: 'BLaw' },
];

function buildCalendar(year: number, month: number) {
  const now = today();
  const daysInMonth = new Date(year, month, 0).getDate();
  // deterministic "review days": every day divisible by 5, plus the 3rd and 12th
  const isReviewDay = (day: number) => day % 5 === 0 || day === 3 || day === 12;

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const date = new Date(year, month - 1, day);
    const isToday = toISO(date) === toISO(now);
    return {
      date: toISO(date),
      day,
      has_review: isReviewDay(day),
      review_count: isReviewDay(day) ? (day % 2 === 0 ? 2 : 1) : 0,
      is_today: isToday,
      is_past: date < now && !isToday,
    };
  });

  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
  const todayDue = isCurrentMonth && isReviewDay(now.getDate())
    ? REVIEW_TOPICS.slice(0, 2).map((t, i) => ({ id: i + 1, ...t, due_at: new Date().toISOString() }))
    : [];

  const upcoming = days
    .filter(d => !d.is_past && !d.is_today && d.has_review)
    .slice(0, 3)
    .map((d, i) => ({ date: d.date, ...REVIEW_TOPICS[(d.day + i) % REVIEW_TOPICS.length] }));

  return {
    year,
    month,
    month_name: new Date(year, month - 1, 1).toLocaleDateString('en-PH', { month: 'long' }),
    days,
    today_reviews: todayDue,
    upcoming,
  };
}

// ─── Notifications ────────────────────────────────────────────────────────────
let notifSeq = 4;
let notifications = [
  { id: 1, type: 'review',      title: 'Spaced reviews due today',  body: 'Deferred Tax (FAR) and Audit Risk (AUD) are scheduled for review.', created_at: new Date().toISOString(), read: false },
  { id: 2, type: 'streak',      title: `${USER.streak_days}-day streak! 🔥`, body: 'Answer at least one quiz today to keep your streak alive.', created_at: new Date(Date.now() - 3600e3).toISOString(), read: false },
  { id: 3, type: 'achievement', title: 'Week Warrior unlocked',     body: 'You studied 7 days in a row. Keep it up!', created_at: new Date(Date.now() - 86400e3).toISOString(), read: true },
];

// ─── Dispatch ─────────────────────────────────────────────────────────────────
export async function mockRequest(method: string, url: string, body?: any): Promise<any> {
  await delay();

  if (method === 'POST' && url === '/login')  return { token: 'mock-token', user: USER };
  if (method === 'POST' && url === '/signup') {
    USER.first_name = body?.first_name ?? 'Test';
    USER.last_name  = body?.last_name ?? 'User';
    USER.email      = body?.email ?? USER.email;
    USER.name       = `${USER.first_name} ${USER.last_name}`;
    return { token: 'mock-token', user: USER };
  }
  if (method === 'POST' && url === '/logout') return { message: 'Logged out.' };
  if (method === 'GET'  && url === '/user')   return { user: USER };

  if (method === 'PUT' && url === '/profile') {
    if (body?.first_name != null)       USER.first_name = String(body.first_name);
    if (body?.last_name != null)        USER.last_name  = String(body.last_name);
    if (body?.exam_target_date !== undefined) USER.exam_target_date = body.exam_target_date || null as any;
    USER.name = `${USER.first_name} ${USER.last_name}`;
    return { ok: true, user: USER };
  }

  if (method === 'GET' && url === '/dashboard') {
    return {
      ...DASHBOARD,
      days_to_exam: DASHBOARD.days_to_exam,
      recent_activity: DASHBOARD.recent_activity,
      streak: USER.streak_days,
      points: USER.total_points,
    };
  }
  if (method === 'GET' && url === '/subjects')  return { subjects: SUBJECTS };

  if (method === 'POST' && url === '/quizzes/start') {
    const mode: string = body?.mode ?? 'adaptive';
    const numItems = mode === 'timed' ? 10 : mode === 'challenge' ? 20 : Number(body?.num_items) || 10;
    const subjectId = body?.subject_id ? Number(body.subject_id) : null;
    const id = sessionSeq++;
    sessions.set(id, {
      session_id: id,
      mode,
      subject_id: subjectId,
      time_limit: mode === 'timed' ? 5 : null,   // 10 questions × 30s
      questions: buildQuestions(numItems, subjectId),
      started_at: new Date().toISOString(),
      results: null,
    });
    return { session_id: id };
  }

  if (method === 'GET' && url === '/quizzes/history') return { sessions: HISTORY };

  const quizMatch    = url.match(/^\/quizzes\/(\d+)$/);
  const submitMatch  = url.match(/^\/quizzes\/(\d+)\/submit$/);
  const cancelMatch  = url.match(/^\/quizzes\/(\d+)\/cancel$/);
  const resultsMatch = url.match(/^\/quizzes\/(\d+)\/results$/);

  if (method === 'GET' && quizMatch) {
    const sess = sessions.get(Number(quizMatch[1]));
    if (!sess) throw new Error('Quiz session not found.');
    return {
      session_id: sess.session_id,
      mode: sess.mode,
      time_limit: sess.time_limit,
      total_items: sess.questions.length,
      // strip answer key before sending to the client
      questions: sess.questions.map(({ correct_option_id, explanation, topic, ...q }) => q),
    };
  }

  if (method === 'POST' && submitMatch) {
    const sess = sessions.get(Number(submitMatch[1]));
    if (!sess) throw new Error('Quiz session not found.');
    if (!sess.results) gradeSession(sess, body?.answers ?? []);
    return { ok: true };
  }

  if (method === 'POST' && cancelMatch) { sessions.delete(Number(cancelMatch[1])); return { ok: true }; }

  if (method === 'GET' && resultsMatch) {
    const id = Number(resultsMatch[1]);
    const sess = sessions.get(id);
    if (sess?.results) return sess.results;
    return cannedResults(id);
  }

  if (method === 'GET' && url === '/performance') return PERFORMANCE;

  if (method === 'GET'  && url === '/review-notes') return { data: notes, current_page: 1, last_page: 1, total: notes.length };
  if (method === 'POST' && url === '/review-notes') {
    const note = { id: noteIdSeq++, title: body?.title ?? '', content: body?.content ?? '', subject_id: null, subject_code: null, is_favorite: false, created_on: fmtDay(today()) };
    notes = [note, ...notes];
    return { ok: true, note };
  }
  const noteMatch = url.match(/^\/review-notes\/(\d+)$/);
  const favMatch  = url.match(/^\/review-notes\/(\d+)\/favorite$/);
  if (method === 'PUT'    && noteMatch) { const id = +noteMatch[1]; notes = notes.map(n => n.id === id ? { ...n, ...body } : n); return { ok: true, note: notes.find(n => n.id === id) }; }
  if (method === 'DELETE' && noteMatch) { const id = +noteMatch[1]; notes = notes.filter(n => n.id !== id); return { ok: true }; }
  if (method === 'POST'   && favMatch)  { const id = +favMatch[1];  notes = notes.map(n => n.id === id ? { ...n, is_favorite: !n.is_favorite } : n); return { ok: true }; }

  if (method === 'GET' && url.startsWith('/calendar')) {
    const y = Number(body?.year)  || today().getFullYear();
    const m = Number(body?.month) || today().getMonth() + 1;
    return buildCalendar(y, m);
  }

  if (method === 'POST' && url === '/ai-tutor/chat') {
    const last = (body?.messages ?? []).slice(-1)[0]?.content ?? '';
    return {
      ok: true,
      provider: 'mock',
      reply: `**Mock AI Tutor** (offline mode)\n\nYou asked: "${last.slice(0, 200)}"\n\nConnect to the real backend (set \`MOCK_MODE = false\` in \`lib/api/client.ts\`) to get real CPA-review answers from Gemini/OpenRouter.`,
    };
  }

  if (method === 'GET' && url === '/notifications') {
    return { notifications, unread_count: notifications.filter(n => !n.read).length };
  }
  if (method === 'POST' && url === '/notifications/read-all') {
    notifications = notifications.map(n => ({ ...n, read: true }));
    return { ok: true };
  }

  throw new Error(`[mock] unhandled ${method} ${url}`);
}
