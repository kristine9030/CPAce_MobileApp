import client from '@/lib/api/client';
import { cacheQuizSession, getOfflineDatabase } from '@/lib/offline-quizzes';

export interface OfflineBankSubject {
  id: number;
  code: string;
  name: string;
  color: string;
}

interface OfflineBankOption {
  id: number;
  letter: string;
  text: string;
  is_correct: boolean;
}

interface OfflineBankQuestion {
  question_id: number;
  subject_id: number;
  topic_id: number;
  question_text: string;
  question_type: string;
  difficulty: string;
  explanation: string | null;
  options: OfflineBankOption[];
}

interface BankQuestionRow {
  question_id: number;
  subject_id: number;
  topic_id: number;
  difficulty: string;
  question_json: string;
}

export interface OfflineQuizOptions {
  mode: string;
  sessionType: string;
  subjectIds: number[];
  count: number;
  isPracticeRoom: boolean;
  practiceDifficulty: string | null;
}

async function ensureBankTables() {
  const database = await getOfflineDatabase();
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS offline_question_bank (
      user_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      topic_id INTEGER NOT NULL,
      difficulty TEXT NOT NULL,
      question_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, question_id)
    );
    CREATE INDEX IF NOT EXISTS offline_bank_user_subject
      ON offline_question_bank(user_id, subject_id, difficulty);
    CREATE TABLE IF NOT EXISTS offline_bank_subjects (
      user_id INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      subject_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, subject_id)
    );
    CREATE TABLE IF NOT EXISTS offline_bank_meta (
      user_id INTEGER PRIMARY KEY NOT NULL,
      synced_at INTEGER NOT NULL
    );
  `);
  return database;
}

export async function syncOfflineQuestionBank(userId: number) {
  const response = await client.get('/quizzes/offline-bank');
  const questions = (response.data.questions ?? []) as OfflineBankQuestion[];
  const subjects = (response.data.subjects ?? []) as OfflineBankSubject[];
  const database = await ensureBankTables();
  const syncedAt = Date.now();

  await database.withExclusiveTransactionAsync(async transaction => {
    await transaction.runAsync('DELETE FROM offline_question_bank WHERE user_id = ?', userId);
    await transaction.runAsync('DELETE FROM offline_bank_subjects WHERE user_id = ?', userId);
    for (const question of questions) {
      await transaction.runAsync(
        `INSERT INTO offline_question_bank
          (user_id, question_id, subject_id, topic_id, difficulty, question_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        userId,
        question.question_id,
        question.subject_id,
        question.topic_id,
        question.difficulty,
        JSON.stringify(question),
        syncedAt,
      );
    }
    for (const subject of subjects) {
      await transaction.runAsync(
        `INSERT INTO offline_bank_subjects (user_id, subject_id, subject_json, updated_at)
         VALUES (?, ?, ?, ?)`,
        userId,
        subject.id,
        JSON.stringify(subject),
        syncedAt,
      );
    }
    await transaction.runAsync(
      `INSERT INTO offline_bank_meta (user_id, synced_at) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET synced_at = excluded.synced_at`,
      userId,
      syncedAt,
    );
  });

  return { questionCount: questions.length, syncedAt };
}

export async function getOfflineBankInfo(userId: number) {
  const database = await ensureBankTables();
  const countRow = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM offline_question_bank WHERE user_id = ?',
    userId,
  );
  const meta = await database.getFirstAsync<{ synced_at: number }>(
    'SELECT synced_at FROM offline_bank_meta WHERE user_id = ?',
    userId,
  );
  return { questionCount: Number(countRow?.count ?? 0), syncedAt: Number(meta?.synced_at ?? 0) };
}

export async function refreshOfflineQuestionBankIfStale(userId: number, maxAgeMs = 6 * 60 * 60 * 1000) {
  const info = await getOfflineBankInfo(userId);
  if (info.questionCount > 0 && Date.now() - info.syncedAt < maxAgeMs) return info;
  return syncOfflineQuestionBank(userId);
}

export async function getOfflineBankSubjects(userId: number) {
  const database = await ensureBankTables();
  const rows = await database.getAllAsync<{ subject_json: string }>(
    'SELECT subject_json FROM offline_bank_subjects WHERE user_id = ? ORDER BY subject_id',
    userId,
  );
  return rows.map(row => JSON.parse(row.subject_json) as OfflineBankSubject);
}

function shuffled<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export async function createQuizFromOfflineBank(userId: number, options: OfflineQuizOptions) {
  const database = await ensureBankTables();
  const rows = await database.getAllAsync<BankQuestionRow>(
    'SELECT * FROM offline_question_bank WHERE user_id = ?',
    userId,
  );

  let candidates = rows;
  if (options.mode === 'topic') {
    const selected = new Set(options.subjectIds);
    candidates = candidates.filter(row => selected.has(Number(row.subject_id)));
  }
  if (options.mode === 'challenge') {
    const hard = candidates.filter(row => ['difficult', 'moderate'].includes(row.difficulty));
    if (hard.length >= options.count) candidates = hard;
  }

  const selectedRows = shuffled(candidates).slice(0, options.count);
  if (selectedRows.length < options.count) {
    throw new Error(`Only ${selectedRows.length} matching offline questions are available. Connect once to refresh the question bank.`);
  }

  const localSessionId = -(Date.now() * 100 + Math.floor(Math.random() * 100));
  const questions = selectedRows.map((row, index) => {
    const question = JSON.parse(row.question_json) as OfflineBankQuestion;
    return {
      item_number: index + 1,
      question_id: question.question_id,
      question_text: question.question_text,
      question_type: question.question_type,
      explanation: options.sessionType === 'training' ? question.explanation : undefined,
      options: shuffled(question.options).map((choice, choiceIndex) => ({
        id: choice.id,
        letter: String.fromCharCode(65 + choiceIndex),
        text: choice.text,
        is_correct: options.sessionType === 'training' ? choice.is_correct : undefined,
      })),
    };
  });

  const session = {
    session_id: localSessionId,
    mode: options.mode,
    session_type: options.sessionType,
    time_limit: options.mode === 'timed' ? Math.max(1, Math.ceil((questions.length * 30) / 60)) : null,
    total_items: questions.length,
    is_practice_room: options.isPracticeRoom,
    offline_live_room: false,
    offline_created: true,
    offline_config: {
      mode: options.mode,
      session_type: options.sessionType,
      subject_ids: options.subjectIds,
      is_practice_room: options.isPracticeRoom,
      practice_difficulty: options.practiceDifficulty,
      question_ids: questions.map(question => question.question_id),
    },
    questions,
  };

  const cached = await cacheQuizSession(userId, session, { startTimer: true });
  if (!cached) throw new Error('The offline quiz could not be created.');
  return cached;
}
