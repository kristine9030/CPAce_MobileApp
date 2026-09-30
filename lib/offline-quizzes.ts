import * as SQLite from 'expo-sqlite';
import client from '@/lib/api/client';

export type CachedQuizStatus = 'active' | 'pending_sync';

export interface CachedQuiz<TSession = any> {
  sessionId: number;
  userId: number;
  session: TSession;
  answers: Record<number, number>;
  revealed: Record<number, boolean>;
  currentIndex: number;
  deadlineAt: number | null;
  openedAt: number | null;
  status: CachedQuizStatus;
  submitPayload: {
    answers: { question_id: number; selected_option_id: number | null }[];
    started_at: string;
    completed_at: string;
    offline_session?: {
      mode: string;
      session_type: string;
      subject_ids: number[];
      is_practice_room: boolean;
      practice_difficulty: string | null;
      question_ids: number[];
    };
  } | null;
  updatedAt: number;
}

interface QuizRow {
  session_id: number;
  user_id: number;
  session_json: string;
  answers_json: string;
  revealed_json: string;
  current_index: number;
  deadline_at: number | null;
  opened_at: number | null;
  status: CachedQuizStatus;
  submit_payload: string | null;
  updated_at: number;
}

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let activeSync: Promise<number> | null = null;
const syncListeners = new Set<(count: number) => void>();

export async function getOfflineDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('cpace-offline.db').then(async database => {
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS offline_quiz_sessions (
          session_id INTEGER PRIMARY KEY NOT NULL,
          user_id INTEGER NOT NULL,
          session_json TEXT NOT NULL,
          answers_json TEXT NOT NULL DEFAULT '{}',
          revealed_json TEXT NOT NULL DEFAULT '{}',
          current_index INTEGER NOT NULL DEFAULT 0,
          deadline_at INTEGER,
          opened_at INTEGER,
          status TEXT NOT NULL DEFAULT 'active',
          submit_payload TEXT,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS offline_quiz_user_status
          ON offline_quiz_sessions(user_id, status, updated_at);
        CREATE TABLE IF NOT EXISTS offline_quiz_sync_map (
          local_session_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          server_session_id INTEGER NOT NULL,
          synced_at INTEGER NOT NULL,
          PRIMARY KEY (local_session_id, user_id)
        );
      `);
      const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(offline_quiz_sessions)');
      if (!columns.some(column => column.name === 'opened_at')) {
        await database.execAsync('ALTER TABLE offline_quiz_sessions ADD COLUMN opened_at INTEGER;');
      }
      return database;
    });
  }
  return databasePromise;
}

function parseRow<TSession>(row: QuizRow): CachedQuiz<TSession> {
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    session: JSON.parse(row.session_json) as TSession,
    answers: JSON.parse(row.answers_json || '{}'),
    revealed: JSON.parse(row.revealed_json || '{}'),
    currentIndex: Number(row.current_index) || 0,
    deadlineAt: row.deadline_at == null ? null : Number(row.deadline_at),
    openedAt: row.opened_at == null ? null : Number(row.opened_at),
    status: row.status,
    submitPayload: row.submit_payload ? JSON.parse(row.submit_payload) : null,
    updatedAt: Number(row.updated_at),
  };
}

export async function cacheQuizSession<TSession extends { session_id: number; time_limit?: number | null }>(
  userId: number,
  session: TSession,
  options: { startTimer?: boolean } = {},
) {
  const database = await getOfflineDatabase();
  const existing = await database.getFirstAsync<QuizRow>(
    'SELECT * FROM offline_quiz_sessions WHERE session_id = ? AND user_id = ?',
    session.session_id,
    userId,
  );
  const deadlineAt = existing?.deadline_at ?? (
    options.startTimer !== false && session.time_limit
      ? Date.now() + Number(session.time_limit) * 60_000
      : null
  );
  const storedSession = existing
    ? { ...JSON.parse(existing.session_json), ...session }
    : session;

  await database.runAsync(
    `INSERT INTO offline_quiz_sessions
      (session_id, user_id, session_json, answers_json, revealed_json, current_index, deadline_at, opened_at, status, submit_payload, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       session_json = excluded.session_json,
       deadline_at = COALESCE(offline_quiz_sessions.deadline_at, excluded.deadline_at),
       updated_at = excluded.updated_at`,
    session.session_id,
    userId,
    JSON.stringify(storedSession),
    existing?.answers_json ?? '{}',
    existing?.revealed_json ?? '{}',
    existing?.current_index ?? 0,
    deadlineAt,
    existing?.opened_at ?? null,
    existing?.status ?? 'active',
    existing?.submit_payload ?? null,
    Date.now(),
  );

  return getCachedQuiz<TSession>(session.session_id, userId);
}

export async function markCachedQuizOpened(
  sessionId: number,
  userId: number,
  timeLimitMinutes: number | null,
) {
  const database = await getOfflineDatabase();
  const now = Date.now();
  const deadlineAt = timeLimitMinutes ? now + timeLimitMinutes * 60_000 : null;
  await database.runAsync(
    `UPDATE offline_quiz_sessions
     SET opened_at = COALESCE(opened_at, ?),
         deadline_at = COALESCE(deadline_at, ?),
         updated_at = ?
     WHERE session_id = ? AND user_id = ?`,
    now,
    deadlineAt,
    now,
    sessionId,
    userId,
  );
  const row = await database.getFirstAsync<{ deadline_at: number | null; opened_at: number | null }>(
    'SELECT deadline_at, opened_at FROM offline_quiz_sessions WHERE session_id = ? AND user_id = ?',
    sessionId,
    userId,
  );
  return {
    deadlineAt: row?.deadline_at == null ? null : Number(row.deadline_at),
    openedAt: row?.opened_at == null ? now : Number(row.opened_at),
  };
}

export async function getCachedQuiz<TSession = any>(sessionId: number, userId: number) {
  const database = await getOfflineDatabase();
  const row = await database.getFirstAsync<QuizRow>(
    'SELECT * FROM offline_quiz_sessions WHERE session_id = ? AND user_id = ?',
    sessionId,
    userId,
  );
  return row ? parseRow<TSession>(row) : null;
}

export async function discardActiveQuizzes(userId: number) {
  const database = await getOfflineDatabase();
  const rows = await database.getAllAsync<{ session_id: number }>(
    `SELECT session_id FROM offline_quiz_sessions
     WHERE user_id = ? AND status = 'active'`,
    userId,
  );
  await database.runAsync(
    `DELETE FROM offline_quiz_sessions
     WHERE user_id = ? AND status = 'active'`,
    userId,
  );
  return rows.map(row => Number(row.session_id));
}

export async function saveQuizProgress(
  sessionId: number,
  userId: number,
  answers: Record<number, number>,
  revealed: Record<number, boolean>,
  currentIndex: number,
) {
  const database = await getOfflineDatabase();
  await database.runAsync(
    `UPDATE offline_quiz_sessions
     SET answers_json = ?, revealed_json = ?, current_index = ?, updated_at = ?
     WHERE session_id = ? AND user_id = ?`,
    JSON.stringify(answers),
    JSON.stringify(revealed),
    currentIndex,
    Date.now(),
    sessionId,
    userId,
  );
}

export async function queueQuizSubmission(
  sessionId: number,
  userId: number,
  payload: CachedQuiz['submitPayload'],
) {
  const database = await getOfflineDatabase();
  await database.runAsync(
    `UPDATE offline_quiz_sessions
     SET status = 'pending_sync', submit_payload = ?, updated_at = ?
     WHERE session_id = ? AND user_id = ?`,
    JSON.stringify(payload),
    Date.now(),
    sessionId,
    userId,
  );
}

export async function removeCachedQuiz(sessionId: number, userId: number) {
  const database = await getOfflineDatabase();
  await database.runAsync(
    'DELETE FROM offline_quiz_sessions WHERE session_id = ? AND user_id = ?',
    sessionId,
    userId,
  );
}

export async function getPendingQuizCount(userId: number) {
  const database = await getOfflineDatabase();
  const row = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM offline_quiz_sessions
     WHERE user_id = ? AND status = 'pending_sync'`,
    userId,
  );
  return Number(row?.count ?? 0);
}

export async function getSyncedQuizSessionId(localSessionId: number, userId: number) {
  const database = await getOfflineDatabase();
  const row = await database.getFirstAsync<{ server_session_id: number }>(
    `SELECT server_session_id FROM offline_quiz_sync_map
     WHERE local_session_id = ? AND user_id = ?`,
    localSessionId,
    userId,
  );
  return row ? Number(row.server_session_id) : null;
}

async function runPendingQuizSync(userId: number) {
  const database = await getOfflineDatabase();
  const rows = await database.getAllAsync<QuizRow>(
    `SELECT * FROM offline_quiz_sessions
     WHERE user_id = ? AND status = 'pending_sync'
     ORDER BY updated_at ASC`,
    userId,
  );

  let synced = 0;
  for (const row of rows) {
    if (!row.submit_payload) continue;
    try {
      const payload = JSON.parse(row.submit_payload) as NonNullable<CachedQuiz['submitPayload']>;
      let serverSessionId = row.session_id;
      if (row.session_id < 0) {
        const existingMap = await database.getFirstAsync<{ server_session_id: number }>(
          `SELECT server_session_id FROM offline_quiz_sync_map
           WHERE local_session_id = ? AND user_id = ?`,
          row.session_id,
          userId,
        );
        if (existingMap) {
          serverSessionId = Number(existingMap.server_session_id);
        } else {
          if (!payload.offline_session) break;
          const created = await client.post('/quizzes/offline-start', {
            ...payload.offline_session,
            started_at: payload.started_at,
          });
          serverSessionId = Number(created.data.session_id);
          await database.runAsync(
            `INSERT INTO offline_quiz_sync_map
              (local_session_id, user_id, server_session_id, synced_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(local_session_id, user_id) DO UPDATE SET
               server_session_id = excluded.server_session_id,
               synced_at = excluded.synced_at`,
            row.session_id,
            userId,
            serverSessionId,
            Date.now(),
          );
        }
      }
      await client.post(`/quizzes/${serverSessionId}/submit`, payload);
      await database.runAsync('DELETE FROM offline_quiz_sessions WHERE session_id = ?', row.session_id);
      synced += 1;
    } catch (err: any) {
      if (!err.response) break;
      // Keep rejected submissions for a future retry or diagnosis. The server's
      // successful "already completed" response is still a 200, so only a real
      // success may remove the durable local copy.
      break;
    }
  }
  return synced;
}

export async function syncPendingQuizzes(userId: number) {
  if (activeSync) return activeSync;
  activeSync = runPendingQuizSync(userId)
    .then(count => {
      if (count > 0) {
        for (const listener of syncListeners) {
          try { listener(count); } catch {}
        }
      }
      return count;
    })
    .finally(() => {
      activeSync = null;
    });
  return activeSync;
}

export function subscribeToOfflineQuizSync(listener: (count: number) => void) {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

export function isNetworkError(error: any) {
  return !error?.response;
}
