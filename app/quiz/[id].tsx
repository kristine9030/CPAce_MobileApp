import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client from '@/lib/api/client';
import { useAuth } from '@/lib/context/auth-context';
import {
  cacheQuizSession,
  getCachedQuiz,
  isNetworkError,
  queueQuizSubmission,
  removeCachedQuiz,
  saveQuizProgress,
  markCachedQuizOpened,
} from '@/lib/offline-quizzes';
import { C, sp, r, font, grad } from '@/constants/cpace-theme';
import { GradientButton, GradientFill } from '@/components/ui/gradient';
import { useLiveRoom, type RivalTier } from '@/lib/liveRoom';
import { LiveRoomPill, LiveRoomSheet, LiveRoomStrip, LiveRoomToasts } from '@/components/quiz/live-room-panel';

interface Option { id: number; letter: string; text: string; is_correct?: boolean }
interface Question {
  item_number: number;
  question_id: number;
  question_text: string;
  question_type: string;
  explanation?: string;
  options: Option[];
}
interface Session {
  session_id: number;
  mode: string;
  session_type: string;
  time_limit: number | null;
  questions: Question[];
  total_items: number;
  is_practice_room?: boolean;
  rival_pool?: RivalTier[];
  offline_live_room?: boolean;
  offline_created?: boolean;
  offline_config?: {
    mode: string;
    session_type: string;
    subject_ids: number[];
    is_practice_room: boolean;
    practice_difficulty: string | null;
    question_ids: number[];
  };
}

export default function TakeQuizScreen() {
  const { id, liveRoom }     = useLocalSearchParams<{ id: string; liveRoom?: string }>();
  const router              = useRouter();
  const { user, offline }   = useAuth();
  const userId              = user?.id;
  const [session, setSession]   = useState<Session | null>(null);
  const [loading, setLoading]   = useState(true);
  const [current, setCurrent]   = useState(0);
  const [answers, setAnswers]   = useState<Record<number, number>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft]     = useState<number | null>(null);
  const [deadlineAt, setDeadlineAt] = useState<number | null>(null);
  const [openedAt, setOpenedAt]     = useState<number | null>(null);
  const [usingSavedCopy, setUsingSavedCopy] = useState(false);
  const [roomSheetOpen, setRoomSheetOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submitRef = useRef<() => void>(() => {});

  const room = useLiveRoom({
    enabled: liveRoom !== '0',
    pool: session?.rival_pool ?? [],
    sessionId: Number(id),
    mode: session?.mode ?? 'adaptive',
    sessionType: session?.session_type ?? 'testing',
    totalQuestions: session?.total_items ?? 0,
    paused: !session || submitting,
  });

  useEffect(() => {
    let active = true;
    (async () => {
      if (!userId) return;
      try {
        let cached;
        try {
          const res = await client.get(`/quizzes/${id}`);
          cached = await cacheQuizSession(userId, res.data);
          if (active) setUsingSavedCopy(false);
        } catch (err) {
          cached = await getCachedQuiz<Session>(Number(id), userId);
          if (!cached) throw err;
          if (active) setUsingSavedCopy(true);
        }

        if (!active || !cached) return;
        const opened = await markCachedQuizOpened(
          cached.sessionId,
          userId,
          cached.session.time_limit ? Number(cached.session.time_limit) : null,
        );
        if (!active) return;
        setSession(cached.session);
        setAnswers(cached.answers);
        setRevealed(cached.revealed);
        setCurrent(Math.min(cached.currentIndex, Math.max(0, cached.session.questions.length - 1)));
        setDeadlineAt(opened.deadlineAt);
        setOpenedAt(opened.openedAt);
        if (opened.deadlineAt) {
          setTimeLeft(Math.max(0, Math.ceil((opened.deadlineAt - Date.now()) / 1000)));
        }
      } catch {
        Alert.alert('Quiz Unavailable', 'Connect to the internet once to download this quiz.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [id, router, userId]);

  const handleSelect = (questionId: number, optionId: number) => {
    if (session?.session_type === 'training' && revealed[questionId]) return;

    // Live Room only reacts to a question's first answer, mirroring the web
    // (re-picking an option before submitting must not feed it a second time).
    const firstAnswer = !(questionId in answers);

    const nextAnswers = { ...answers, [questionId]: optionId };
    const nextRevealed = session?.session_type === 'training'
      ? { ...revealed, [questionId]: true }
      : revealed;
    setAnswers(nextAnswers);
    setRevealed(nextRevealed);
    if (user && session) {
      saveQuizProgress(session.session_id, user.id, nextAnswers, nextRevealed, current).catch(() => {});
    }

    if (firstAnswer) {
      // Testing mode never reveals correctness client-side, so the room
      // simply doesn't score correctness there (it only ranks by pace).
      const isCorrect = session?.session_type === 'training'
        ? Boolean(session.questions.find(q => q.question_id === questionId)?.options.find(o => o.id === optionId)?.is_correct)
        : false;
      room.onAnswer(isCorrect);
    }
  };

  const handleSubmit = async (auto = false) => {
    if (!auto) {
      const unanswered = session!.questions.filter(q => !answers[q.question_id]).length;
      if (unanswered > 0) {
        Alert.alert(
          'Unanswered Questions',
          `You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. Submit anyway?`,
          [{ text: 'Review', style: 'cancel' }, { text: 'Submit', onPress: () => doSubmit() }]
        );
        return;
      }
    }
    doSubmit();
  };

  const doSubmit = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSubmitting(true);
    try {
      const answersPayload = session!.questions.map(q => ({
        question_id:      q.question_id,
        selected_option_id: answers[q.question_id] ?? null,
      }));
      const payload = {
        answers: answersPayload,
        started_at: new Date(openedAt ?? Date.now()).toISOString(),
        completed_at: new Date().toISOString(),
        ...(session!.offline_created && session!.offline_config
          ? { offline_session: session!.offline_config }
          : {}),
      };
      await room.finish();
      if (!user) throw new Error('No signed-in user.');

      if (offline || session!.offline_created) {
        await queueQuizSubmission(Number(id), user.id, payload);
        router.replace({ pathname: '/quiz/results/[id]', params: { id, pending: '1' } });
        return;
      }

      try {
        await client.post(`/quizzes/${id}/submit`, payload);
        await removeCachedQuiz(Number(id), user.id);
        router.replace({ pathname: '/quiz/results/[id]', params: { id } });
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        await queueQuizSubmission(Number(id), user.id, payload);
        router.replace({ pathname: '/quiz/results/[id]', params: { id, pending: '1' } });
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not submit.');
      setSubmitting(false);
    }
  };

  useEffect(() => {
    submitRef.current = doSubmit;
  });

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!deadlineAt || submitting) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0 && timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        submitRef.current();
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [deadlineAt, submitting]);

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={C.accent} /></View>;
  }

  if (!session) return null;

  const q      = session.questions[current];
  const total  = session.questions.length;
  const answered = Object.keys(answers).length;
  const isTraining = session.session_type === 'training';

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <LiveRoomToasts toasts={room.toasts} />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerSide} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.headerTitle}>{q.item_number} / {total}</Text>
          {timeLeft !== null && (
            <Text style={[s.timer, timeLeft < 60 && { color: '#ff6b6b' }]}>{fmtTime(timeLeft)}</Text>
          )}
        </View>
        {room.active ? (
          <LiveRoomPill standing={room.standing} streak={room.streak} onPress={() => setRoomSheetOpen(true)} />
        ) : (
          <Text style={s.answeredCount}>{answered}/{total}</Text>
        )}
      </View>

      {room.active && (
        <LiveRoomSheet
          visible={roomSheetOpen}
          onClose={() => setRoomSheetOpen(false)}
          rows={room.rows}
          standing={room.standing}
          streak={room.streak}
          bestStreak={room.bestStreak}
          feed={room.feed}
        />
      )}

      {/* Progress Bar */}
      <View style={s.progressBg}>
        <GradientFill diagonal={false} style={[s.progressFill, { width: `${((current + 1) / total) * 100}%` }]} />
      </View>

      {(offline || usingSavedCopy) && (
        <View style={s.offlineNotice}>
          <Ionicons name="cloud-offline-outline" size={14} color={C.warning} />
          <Text style={s.offlineNoticeText}>Offline progress is being saved on this device</Text>
        </View>
      )}

      {/* Live Room: rivals stay visible on-screen the whole time you're answering */}
      {room.active && <LiveRoomStrip rows={room.rows} onPress={() => setRoomSheetOpen(true)} />}

      <ScrollView contentContainerStyle={{ padding: sp.lg }}>
        <Text style={s.questionText}>{q.question_text}</Text>

        {q.options.map((opt) => {
          const selected = answers[q.question_id] === opt.id;
          const isRevealed = isTraining && revealed[q.question_id];
          const showCorrect = isRevealed && opt.is_correct;
          const showWrong = isRevealed && selected && !opt.is_correct;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[
                s.option,
                selected && s.optionSelected,
                showCorrect && s.optionCorrect,
                showWrong && s.optionWrong,
              ]}
              onPress={() => handleSelect(q.question_id, opt.id)}
              disabled={isRevealed}
            >
              {selected ? (
                <GradientFill style={[s.optLetter, s.optLetterSelected]}>
                  <Text style={[s.optLetterText, { color: C.white }]}>{opt.letter}</Text>
                </GradientFill>
              ) : (
                <View style={s.optLetter}>
                  <Text style={s.optLetterText}>{opt.letter}</Text>
                </View>
              )}
              <Text style={[s.optText, selected && s.optTextSelected]}>{opt.text}</Text>
              {showCorrect && <Ionicons name="checkmark-circle" size={20} color="#2e9e5b" />}
              {showWrong && <Ionicons name="close-circle" size={20} color="#d64545" />}
            </TouchableOpacity>
          );
        })}

        {isTraining && revealed[q.question_id] && (
          <View style={s.feedbackPanel}>
            <Text style={s.feedbackTitle}>
              {answers[q.question_id] != null && q.options.find(o => o.id === answers[q.question_id])?.is_correct
                ? 'Correct!' : 'Incorrect.'}
            </Text>
            {!!q.explanation && <Text style={s.feedbackText}>{q.explanation}</Text>}
          </View>
        )}
      </ScrollView>

      {/* Bottom Nav */}
      <View style={s.bottomNav}>
        <TouchableOpacity
          style={[s.navBtn, current === 0 && s.navBtnDisabled]}
          onPress={() => {
            const next = Math.max(0, current - 1);
            setCurrent(next);
            if (user) saveQuizProgress(Number(id), user.id, answers, revealed, next).catch(() => {});
          }}
          disabled={current === 0}
        >
          <Ionicons name="arrow-back" size={20} color={current === 0 ? C.light : C.text} />
          <Text style={[s.navBtnText, current === 0 && { color: C.light }]}>Prev</Text>
        </TouchableOpacity>

        {current < total - 1 ? (
          <GradientButton radius={r.md} contentStyle={s.navBtnPrimary} onPress={() => {
            const next = current + 1;
            setCurrent(next);
            if (user) saveQuizProgress(Number(id), user.id, answers, revealed, next).catch(() => {});
          }}>
            <Text style={s.navBtnPrimaryText}>Next</Text>
            <Ionicons name="arrow-forward" size={20} color={C.white} />
          </GradientButton>
        ) : (
          <GradientButton
            radius={r.md}
            colors={grad.success}
            contentStyle={s.navBtnPrimary}
            onPress={() => handleSubmit()}
            loading={submitting}
          >
            <Text style={s.navBtnPrimaryText}>Submit</Text>
            <Ionicons name="checkmark" size={20} color={C.white} />
          </GradientButton>
        )}
      </View>
    </SafeAreaView>
  );
}

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const s = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: C.bg },
  center:           { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  header:           { backgroundColor: C.bg, flexDirection: 'row', alignItems: 'center', paddingHorizontal: sp.lg, paddingVertical: sp.md },
  headerSide:       { width: 24 },
  headerTitle:      { fontSize: 15, fontFamily: font.semiBold, color: C.text },
  timer:            { fontSize: 12, fontFamily: font.medium, color: C.muted, marginTop: 2 },
  answeredCount:    { fontSize: 13, fontFamily: font.regular, color: C.muted },
  progressBg:       { height: 3, backgroundColor: C.border },
  progressFill:     { height: 3 },
  offlineNotice:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.warning + '16', paddingVertical: 7 },
  offlineNoticeText:{ fontSize: 11.5, fontFamily: font.medium, color: C.muted },
  questionText:     { fontSize: 16, lineHeight: 24, color: C.text, fontFamily: font.semiBold, marginBottom: sp.lg },
  option:           { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.lg, padding: sp.md, marginBottom: sp.sm, borderWidth: 1, borderColor: C.border, },
  optionSelected:   { borderColor: C.accent, backgroundColor: 'rgba(165,32,32,0.04)' },
  optionCorrect:    { borderColor: '#2e9e5b', backgroundColor: 'rgba(46,158,91,0.08)' },
  optionWrong:      { borderColor: '#d64545', backgroundColor: 'rgba(214,69,69,0.08)' },
  feedbackPanel:    { borderRadius: r.lg, padding: sp.md, backgroundColor: 'rgba(0,0,0,0.03)', borderWidth: 1, borderColor: C.border, marginTop: sp.xs },
  feedbackTitle:    { fontSize: 14, fontFamily: font.bold, color: C.text, marginBottom: 4 },
  feedbackText:     { fontSize: 13, fontFamily: font.regular, color: C.muted, lineHeight: 19 },
  optLetter:        { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', marginRight: sp.sm },
  optLetterSelected:{ borderColor: 'transparent', overflow: 'hidden' },
  optLetterText:    { fontSize: 13, fontFamily: font.bold, color: C.muted },
  optText:          { flex: 1, fontSize: 14, fontFamily: font.regular, color: C.text, lineHeight: 20, paddingTop: 6 },
  optTextSelected:  { color: C.primary, fontFamily: font.semiBold },
  bottomNav:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: sp.md, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.card },
  navBtn:           { flexDirection: 'row', alignItems: 'center', gap: sp.xs, paddingHorizontal: sp.md, paddingVertical: 10, borderRadius: r.md, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
  navBtnDisabled:   { opacity: 0.4 },
  navBtnText:       { fontSize: 15, fontFamily: font.semiBold, color: C.text },
  navBtnPrimary:    { gap: sp.xs, paddingHorizontal: sp.lg, paddingVertical: 10 },
  navBtnPrimaryText:{ fontSize: 15, fontFamily: font.bold, color: C.white },
});
