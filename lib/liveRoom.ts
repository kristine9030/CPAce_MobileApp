// Live Room — a port of the web app's take-quiz.blade.php `Room` object.
//
// Four simulated candidates work through the same quiz alongside the
// student so practice carries the pulse of a real exam hall: someone is
// always a question ahead, and passing them is a moment worth chasing. The
// roster is seeded from the session id, so one sitting always draws the
// same rivals while a retake draws a fresh set.
//
// This layer is purely cosmetic — it never touches grading, points, the
// spaced-repetition schedule, or what gets submitted. See lib/storage.ts
// for how the finishing standing is handed off to the results screen
// (mirrors the web's sessionStorage handoff).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { storage } from '@/lib/storage';

export interface RivalTier {
  name: string;
  tag: string;
  color: string;
  spq: number;
  acc: number;
}

interface RivalState extends RivalTier {
  edge: number;
  progress: number;
  correct: number;
  elapsed: number;
  next: number;
  ahead: boolean;
  done: boolean;
  doneAt: number | null;
  passNoted: boolean;
}

export interface RoomRow {
  key: string;
  name: string;
  tag: string;
  color: string;
  progress: number;
  correct: number;
  done: boolean;
  you: boolean;
}

export interface RoomStanding {
  you: number;
  correct: number;
  byScore: boolean;
  place: number;
  total: number;
}

export interface RoomToast {
  id: number;
  text: string;
  kind: 'good' | 'warn' | 'fire';
  icon: string;
}

export interface RoomFeedItem {
  id: number;
  text: string;
  icon: string;
}

export interface RoomSummary {
  place: number;
  total: number;
  streak: number;
  answered: number;
  correct: number | null;
  byScore: boolean;
  questions: number;
}

// How much faster than the student each rival aims to be, strongest first.
// Training is ranked on accuracy, so every rival can out-pace you there and
// the room is still winnable by answering well. Testing is ranked on pace
// alone, so the last rival sits a hair behind you.
const EDGES = [0.72, 0.82, 0.9, 0.98];
const EDGES_TESTING = [0.76, 0.86, 0.94, 1.05];

/** Small deterministic PRNG (mulberry32) — same session, same roster. */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const storageKey = (sessionId: number) => `cpaceRoom${sessionId}`;

/** Read (and clear) the finishing standing left behind by a completed room. */
export async function takeRoomSummary(sessionId: number): Promise<RoomSummary | null> {
  try {
    const raw = await storage.get(storageKey(sessionId));
    if (!raw) return null;
    await storage.del(storageKey(sessionId));
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const LIVE_ROOM_PREF_KEY = 'quizLiveRoomOn';
const ROOM_MODE_PREF_KEY = 'quizRoomMode';

export async function getLiveRoomPref(): Promise<boolean> {
  const v = await storage.get(LIVE_ROOM_PREF_KEY);
  return v !== '0'; // on by default, mirrors the web
}
export async function setLiveRoomPref(on: boolean): Promise<void> {
  await storage.set(LIVE_ROOM_PREF_KEY, on ? '1' : '0');
}
export async function getRoomModePref(): Promise<'ranked' | 'practice'> {
  const v = await storage.get(ROOM_MODE_PREF_KEY);
  return v === 'practice' ? 'practice' : 'ranked';
}
export async function setRoomModePref(mode: 'ranked' | 'practice'): Promise<void> {
  await storage.set(ROOM_MODE_PREF_KEY, mode);
}

interface UseLiveRoomArgs {
  enabled: boolean;
  pool: RivalTier[];
  sessionId: number;
  mode: string; // adaptive | topic | timed | challenge
  sessionType: string; // training | testing
  totalQuestions: number;
  /** Pause the room clock (e.g. while the session hasn't started, or is submitting). */
  paused?: boolean;
}

let toastSeq = 0;
let feedSeq = 0;

export function useLiveRoom({ enabled, pool, sessionId, mode, sessionType, totalQuestions, paused }: UseLiveRoomArgs) {
  const rivalsRef = useRef<RivalState[]>([]);
  const feedRef = useRef<RoomFeedItem[]>([]);
  const paceSamplesRef = useRef<number[]>([]);
  const lastAnswerAtRef = useRef<number>(0);
  const youCorrectRef = useRef(0);
  const youAnsweredRef = useRef(0);
  const youDoneAtRef = useRef<number | null>(null);
  const tRef = useRef(0);
  const closedRef = useRef(false);
  const lastPlaceRef = useRef<number | null>(null);
  const lastRankToastAtRef = useRef(-99);
  const streakRef = useRef(0);
  const bestStreakRef = useRef(0);

  const [, bump] = useState(0);
  const render = useCallback(() => bump((n) => n + 1), []);
  const [toasts, setToasts] = useState<RoomToast[]>([]);

  const active = rivalsRef.current.length > 0;

  // ── init (once per session) ───────────────────────────────────────────
  useEffect(() => {
    rivalsRef.current = [];
    feedRef.current = [];
    paceSamplesRef.current = [];
    lastAnswerAtRef.current = 0;
    youCorrectRef.current = 0;
    youAnsweredRef.current = 0;
    youDoneAtRef.current = null;
    tRef.current = 0;
    closedRef.current = false;
    lastPlaceRef.current = null;
    lastRankToastAtRef.current = -99;
    streakRef.current = 0;
    bestStreakRef.current = 0;
    setToasts([]);

    // A 1–2 question quiz is over before a race can mean anything.
    if (!enabled || totalQuestions < 3 || !pool.length) {
      render();
      return;
    }

    const rand = makeRng(Math.imul(sessionId || 1, 2654435761));
    // Harder questions slow everyone down; Timed mode speeds them up.
    const pace = mode === 'challenge' ? 1.4 : mode === 'timed' ? 0.8 : 1;

    const chosen = pool
      .map((p) => ({ p, k: rand() }))
      .sort((a, b) => a.k - b.k)
      .slice(0, 4)
      .map((entry): RivalState => ({
        ...entry.p,
        spq: entry.p.spq * pace * (0.85 + rand() * 0.3),
        edge: 1,
        progress: 0,
        correct: 0,
        elapsed: 0,
        next: 0,
        ahead: false,
        done: false,
        doneAt: null,
        passNoted: false,
      }));

    // The naturally quickest rival gets the sharpest edge over the student,
    // so a personality's character and its pressure point the same way.
    const edges = sessionType === 'training' ? EDGES : EDGES_TESTING;
    [...chosen]
      .sort((a, b) => a.spq - b.spq)
      .forEach((r, i) => { r.edge = edges[i] ?? edges[edges.length - 1]; });

    chosen.forEach((r) => { r.next = r.spq * (0.5 + rand() * 0.4); });

    rivalsRef.current = chosen;
    say('Room open — 4 top-scoring candidates seated with you.');
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sessionId, pool.length, totalQuestions]);

  const say = useCallback((text: string, icon = 'information-circle') => {
    feedRef.current = [{ id: ++feedSeq, text, icon }, ...feedRef.current].slice(0, 4);
  }, []);

  const toast = useCallback((text: string, kind: RoomToast['kind'], icon: string) => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev.slice(-1), { id, text, kind, icon }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2400);
  }, []);

  /** The student's recent seconds-per-question (last 3 answers). */
  const myPace = useCallback((): number | null => {
    if (!paceSamplesRef.current.length) return null;
    const recent = paceSamplesRef.current.slice(-3);
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    return Math.max(4, Math.min(mean, 180));
  }, []);

  /** How long this rival takes on its next question. */
  const target = useCallback((r: RivalState): number => {
    const mine = myPace();
    if (mine === null) return r.spq;
    return Math.max(5, Math.min(mine * r.edge, r.spq * 1.8));
  }, [myPace]);

  /** Rival accuracy. Training holds rivals to a margin above the student's own. */
  const effAcc = useCallback((r: RivalState): number => {
    if (sessionType !== 'training' || !youAnsweredRef.current) return r.acc;
    return Math.min(0.97, Math.max(r.acc, youCorrectRef.current / youAnsweredRef.current + 0.05));
  }, [sessionType]);

  const checkOvertakes = useCallback(() => {
    const you = youAnsweredRef.current;
    rivalsRef.current.forEach((r) => {
      const ahead = r.progress > you;
      if (ahead && !r.ahead && you > 0 && !r.passNoted) {
        r.passNoted = true;
        say(`${r.name} moved ahead of you.`, 'trending-up');
      }
      r.ahead = ahead;
    });
  }, [say]);

  const standing = useCallback((): RoomStanding => {
    const you = youAnsweredRef.current;
    const youDone = youDoneAtRef.current === null ? Infinity : youDoneAtRef.current;
    const byScore = sessionType === 'training';
    const mine = byScore ? youCorrectRef.current : you;

    const ahead = rivalsRef.current.filter((r) => {
      const theirs = byScore ? r.correct : r.progress;
      if (theirs !== mine) return theirs > mine;
      if (byScore) return false;
      return r.done && you >= totalQuestions && (r.doneAt ?? Infinity) < youDone;
    }).length;

    return { you, correct: youCorrectRef.current, byScore, place: ahead + 1, total: rivalsRef.current.length + 1 };
  }, [sessionType, totalQuestions]);

  const announceRank = useCallback((place: number) => {
    if (lastPlaceRef.current === null) { lastPlaceRef.current = place; return; }
    if (place === lastPlaceRef.current) return;

    const improved = place < lastPlaceRef.current;
    const quiet = tRef.current - lastRankToastAtRef.current < 12;
    lastPlaceRef.current = place;
    if (quiet) return;

    lastRankToastAtRef.current = tRef.current;
    if (improved) toast(`Climbed to #${place} in the room!`, 'good', 'trending-up');
    else toast(`Slipped to #${place} — the room is pulling ahead`, 'warn', 'trending-down');
  }, [toast]);

  // ── the 1-second room clock ─────────────────────────────────────────────
  useEffect(() => {
    if (!active || paused) return;
    const id = setInterval(() => {
      if (closedRef.current) return;
      tRef.current++;
      const milestone = Math.max(3, Math.round(totalQuestions / 4));
      let moved = false;

      rivalsRef.current.forEach((r) => {
        if (r.done) return;
        r.elapsed++;
        if (r.elapsed < r.next) return;

        r.elapsed = 0;
        r.next = target(r) * (0.8 + Math.random() * 0.4); // human-ish jitter
        r.progress++;
        if (Math.random() < effAcc(r)) r.correct++;
        moved = true;

        if (r.progress >= totalQuestions) {
          r.progress = totalQuestions;
          r.done = true;
          r.doneAt = tRef.current;
          say(`${r.name} submitted their quiz.`, 'flag');
        } else if (r.progress % milestone === 0) {
          say(`${r.name} reached Q${r.progress}.`, 'play-forward');
        }
      });

      if (moved) checkOvertakes();
      const s = standing();
      announceRank(s.place);
      render();
    }, 1000);
    return () => clearInterval(id);
  }, [active, paused, totalQuestions, target, effAcc, checkOvertakes, standing, announceRank, say, render]);

  /** Call whenever the student answers a question. */
  const onAnswer = useCallback((isCorrect: boolean) => {
    if (!active || closedRef.current) return;

    const now = Date.now();
    const gap = lastAnswerAtRef.current ? (now - lastAnswerAtRef.current) / 1000 : null;
    lastAnswerAtRef.current = now;
    if (gap !== null) paceSamplesRef.current.push(gap);
    youAnsweredRef.current++;
    if (isCorrect) youCorrectRef.current++;
    if (youAnsweredRef.current >= totalQuestions && youDoneAtRef.current === null) youDoneAtRef.current = tRef.current;

    // Training reveals correctness, so the streak can reward accuracy.
    // Testing must never leak it, so there the streak rewards pace only.
    const keepsStreak = sessionType === 'training' ? isCorrect : true;

    if (keepsStreak) {
      streakRef.current++;
      bestStreakRef.current = Math.max(bestStreakRef.current, streakRef.current);
      if (streakRef.current === 3) toast("3 in a row — you're heating up!", 'fire', 'flame');
      else if (streakRef.current === 5 || (streakRef.current > 5 && streakRef.current % 5 === 0)) {
        toast(`${streakRef.current} straight — unstoppable!`, 'fire', 'flame');
        say(`You hit a ${streakRef.current}-answer streak.`, 'flame');
      }
    } else {
      if (streakRef.current >= 3) toast(`Streak broken at ${streakRef.current}`, 'warn', 'heart-dislike');
      streakRef.current = 0;
    }

    if (gap !== null && gap < 20) toast(`Quick answer — ${Math.round(gap)}s`, 'good', 'flash');

    // Passing a rival is the payoff moment the whole panel exists for.
    const you = youAnsweredRef.current;
    rivalsRef.current.forEach((r) => {
      if (r.ahead && you > r.progress) {
        r.ahead = false;
        toast(`You passed ${r.name}!`, 'good', 'trending-up');
        say(`You overtook ${r.name}.`, 'trending-up');
      }
    });

    render();
  }, [active, sessionType, totalQuestions, toast, say, render]);

  /** Freeze the race and hand the final placing off to the results screen. */
  const finish = useCallback(async () => {
    if (!active || closedRef.current) return;
    closedRef.current = true;
    const s = standing();
    const summary: RoomSummary = {
      place: s.place,
      total: s.total,
      streak: bestStreakRef.current,
      answered: s.you,
      correct: s.byScore ? youCorrectRef.current : null,
      byScore: s.byScore,
      questions: totalQuestions,
    };
    try { await storage.set(storageKey(sessionId), JSON.stringify(summary)); } catch {}
  }, [active, standing, totalQuestions, sessionId]);

  const s = standing();
  const UNFINISHED = 1e12;
  const rows: RoomRow[] = useMemo(() => {
    if (!active) return [];
    const list = rivalsRef.current.map((r): RoomRow & { at: number } => ({
      key: r.name, name: r.name, tag: r.done ? 'finished' : r.tag, color: r.color,
      progress: r.progress, correct: r.correct, done: r.done, you: false,
      at: r.done ? (r.doneAt ?? UNFINISHED) : UNFINISHED,
    }));
    list.push({
      key: 'you', name: 'You', tag: 'your pace', color: '#7B1D1D',
      progress: s.you, correct: youCorrectRef.current, done: false, you: true,
      at: youDoneAtRef.current === null ? UNFINISHED : youDoneAtRef.current,
    });
    const key = s.byScore ? 'correct' : 'progress';
    list.sort((a, b) => (b[key] - a[key]) || (b.progress - a.progress) || (a.at - b.at) || (a.you ? -1 : 1));
    return list.map(({ at, ...row }) => row);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, s.you, s.byScore, tRef.current]);

  return {
    active,
    standing: s,
    streak: streakRef.current,
    bestStreak: bestStreakRef.current,
    rows,
    feed: feedRef.current,
    toasts,
    onAnswer,
    finish,
  };
}
