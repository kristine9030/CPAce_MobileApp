import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client from '@/lib/api/client';
import { C, sp, r, font, grad } from '@/constants/cpace-theme';
import { GradientButton, GradientFill } from '@/components/ui/gradient';

interface Choice { label: string; text: string }
interface Item {
  id: number;
  question_text: string;
  points: number;
  choices: Choice[];
}

function fmtTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export default function ClassQuizTakeScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();

  const [items, setItems]       = useState<Item[]>([]);
  const [title, setTitle]       = useState('');
  const [current, setCurrent]   = useState(0);
  const [answers, setAnswers]   = useState<Record<number, string>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [loading, setLoading]   = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Guards against the timer firing a second submit while one is in flight.
  const submittedRef = useRef(false);
  const answersRef   = useRef<Record<number, string>>({});
  answersRef.current = answers;

  const doSubmit = useCallback(async (auto = false) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);

    try {
      await client.post(`/class-quizzes/${token}/submit`, { answers: answersRef.current });
      router.replace({ pathname: '/class-quiz/result', params: { token: String(token), auto: auto ? '1' : '0' } });
    } catch (err: any) {
      if (err.response?.data?.submitted) {
        router.replace({ pathname: '/class-quiz/result', params: { token: String(token) } });
        return;
      }
      submittedRef.current = false;
      setSubmitting(false);
      Alert.alert('Error', err.message || 'Could not submit your answers.');
    }
  }, [token]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await client.get(`/class-quizzes/${token}/take`);
        if (!alive) return;
        setItems(res.data.items ?? []);
        setTitle(res.data.quiz?.title ?? '');
        setTimeLeft(res.data.seconds_left);
      } catch (err: any) {
        if (!alive) return;
        if (err.response?.data?.submitted) {
          router.replace({ pathname: '/class-quiz/result', params: { token: String(token) } });
          return;
        }
        Alert.alert('Error', err.message || 'Could not load this quiz.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [token]);

  // Countdown. seconds_left already accounts for both the per-attempt limit
  // and the quiz deadline, so this just ticks it down and auto-submits at 0.
  useEffect(() => {
    if (timeLeft === null) return;

    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t === null) return null;
        if (t <= 1) {
          clearInterval(id);
          doSubmit(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [timeLeft !== null, doSubmit]);

  // Leaving mid-attempt would strand them — the attempt is already open, so
  // make backing out an explicit choice.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmLeave();
      return true;
    });
    return () => sub.remove();
  }, []);

  const confirmLeave = () => {
    Alert.alert(
      'Leave quiz?',
      'Your attempt stays open and the timer keeps running. You can come back to finish it.',
      [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => router.back() },
      ],
    );
  };

  const confirmSubmit = () => {
    const unanswered = items.filter((i) => !answers[i.id]).length;
    if (unanswered > 0) {
      Alert.alert(
        'Unanswered questions',
        `You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. Submit anyway?`,
        [
          { text: 'Review', style: 'cancel' },
          { text: 'Submit', onPress: () => doSubmit() },
        ],
      );
      return;
    }
    Alert.alert('Submit quiz?', 'You cannot change your answers after this.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Submit', onPress: () => doSubmit() },
    ]);
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={C.accent} /></View>;
  }
  if (items.length === 0) return null;

  const item = items[current];
  const total = items.length;
  const answered = Object.keys(answers).length;
  const lowTime = timeLeft !== null && timeLeft < 60;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={confirmLeave} hitSlop={8}>
          <Ionicons name="close" size={24} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.headerTitle} numberOfLines={1}>{current + 1} / {total}</Text>
          {timeLeft !== null && (
            <Text style={[s.timer, lowTime && { color: C.danger }]}>{fmtTime(timeLeft)}</Text>
          )}
        </View>
        <Text style={s.answeredCount}>{answered}/{total}</Text>
      </View>

      <View style={s.progressBg}>
        <GradientFill diagonal={false} style={[s.progressFill, { width: `${((current + 1) / total) * 100}%` }]} />
      </View>

      {/* Question jump strip — long class quizzes are painful without it */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.jumpStrip}
      >
        {items.map((it, idx) => {
          const isCurrent = idx === current;
          const isAnswered = !!answers[it.id];
          return (
            <TouchableOpacity
              key={it.id}
              onPress={() => setCurrent(idx)}
              style={[
                s.jumpDot,
                isAnswered && s.jumpDotAnswered,
                isCurrent && s.jumpDotCurrent,
              ]}
            >
              <Text style={[
                s.jumpDotText,
                isAnswered && { color: C.primary },
                isCurrent && { color: C.white },
              ]}>{idx + 1}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: sp.lg }}>
        {title ? <Text style={s.quizTitle} numberOfLines={1}>{title}</Text> : null}

        <View style={s.questionRow}>
          <Text style={s.questionText}>{item.question_text}</Text>
          {item.points > 1 ? (
            <Text style={s.points}>{item.points} pts</Text>
          ) : null}
        </View>

        {item.choices.map((choice) => {
          const selected = answers[item.id] === choice.label;
          return (
            <TouchableOpacity
              key={choice.label}
              style={[s.option, selected && s.optionSelected]}
              activeOpacity={0.8}
              onPress={() => setAnswers((prev) => ({ ...prev, [item.id]: choice.label }))}
            >
              {selected ? (
                <GradientFill style={[s.optLetter, s.optLetterSelected]}>
                  <Text style={[s.optLetterText, { color: C.white }]}>{choice.label}</Text>
                </GradientFill>
              ) : (
                <View style={s.optLetter}>
                  <Text style={s.optLetterText}>{choice.label}</Text>
                </View>
              )}
              <Text style={[s.optText, selected && s.optTextSelected]}>{choice.text}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={s.bottomNav}>
        <TouchableOpacity
          style={[s.navBtn, current === 0 && s.navBtnDisabled]}
          onPress={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={current === 0}
        >
          <Ionicons name="arrow-back" size={20} color={current === 0 ? C.light : C.text} />
          <Text style={[s.navBtnText, current === 0 && { color: C.light }]}>Prev</Text>
        </TouchableOpacity>

        {current < total - 1 ? (
          <GradientButton radius={r.md} contentStyle={s.navBtnPrimary} onPress={() => setCurrent((c) => c + 1)}>
            <Text style={s.navBtnPrimaryText}>Next</Text>
            <Ionicons name="arrow-forward" size={20} color={C.white} />
          </GradientButton>
        ) : (
          <GradientButton
            radius={r.md}
            colors={grad.success}
            contentStyle={s.navBtnPrimary}
            onPress={confirmSubmit}
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

const s = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: C.bg },
  center:           { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  header:           { backgroundColor: C.bg, flexDirection: 'row', alignItems: 'center', paddingHorizontal: sp.lg, paddingVertical: sp.md },
  headerTitle:      { fontSize: 15, fontFamily: font.semiBold, color: C.text },
  timer:            { fontSize: 12, fontFamily: font.bold, color: C.muted, marginTop: 2 },
  answeredCount:    { fontSize: 13, fontFamily: font.regular, color: C.muted },
  progressBg:       { height: 3, backgroundColor: C.border },
  progressFill:     { height: 3 },
  jumpStrip:        { paddingHorizontal: sp.md, paddingVertical: sp.sm, gap: 6 },
  jumpDot:          { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, justifyContent: 'center', alignItems: 'center' },
  jumpDotAnswered:  { borderColor: C.primary, backgroundColor: 'rgba(123,20,22,0.08)' },
  jumpDotCurrent:   { backgroundColor: C.primary, borderColor: C.primary },
  jumpDotText:      { fontSize: 12, fontFamily: font.bold, color: C.muted },
  quizTitle:        { fontSize: 12, fontFamily: font.semiBold, color: C.muted, marginBottom: sp.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  questionRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: sp.sm, marginBottom: sp.lg },
  questionText:     { flex: 1, fontSize: 16, lineHeight: 24, color: C.text, fontFamily: font.semiBold },
  points:           { fontSize: 11, fontFamily: font.bold, color: C.accent, backgroundColor: 'rgba(165,32,32,0.10)', paddingHorizontal: sp.sm, paddingVertical: 3, borderRadius: r.sm, overflow: 'hidden' },
  option:           { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.lg, padding: sp.md, marginBottom: sp.sm, borderWidth: 1, borderColor: C.border },
  optionSelected:   { borderColor: C.accent, backgroundColor: 'rgba(165,32,32,0.04)' },
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
