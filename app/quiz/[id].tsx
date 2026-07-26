import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client from '@/lib/api/client';
import { C, sp, r, font, grad } from '@/constants/cpace-theme';
import { GradientButton, GradientFill } from '@/components/ui/gradient';

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
}

export default function TakeQuizScreen() {
  const { id }              = useLocalSearchParams<{ id: string }>();
  const router              = useRouter();
  const [session, setSession]   = useState<Session | null>(null);
  const [loading, setLoading]   = useState(true);
  const [current, setCurrent]   = useState(0);
  const [answers, setAnswers]   = useState<Record<number, number>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft]     = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadSession();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [id]);

  const loadSession = async () => {
    try {
      const res = await client.get(`/quizzes/${id}`);
      setSession(res.data);
      if (res.data.time_limit) {
        const totalSec = res.data.time_limit * 60;
        setTimeLeft(totalSec);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not load quiz.', [{ text: 'OK', onPress: () => router.back() }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (timeLeft === null) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t === null || t <= 1) { handleSubmit(true); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timeLeft !== null]);

  const handleSelect = (questionId: number, optionId: number) => {
    if (session?.session_type === 'training' && revealed[questionId]) return;
    setAnswers(prev => ({ ...prev, [questionId]: optionId }));
    if (session?.session_type === 'training') {
      setRevealed(prev => ({ ...prev, [questionId]: true }));
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
      const payload = session!.questions.map(q => ({
        question_id:      q.question_id,
        selected_option_id: answers[q.question_id] ?? null,
      }));
      await client.post(`/quizzes/${id}/submit`, { answers: payload });
      router.replace({ pathname: '/quiz/results/[id]', params: { id } });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not submit.');
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel Quiz',
      'Your progress will be lost.',
      [
        { text: 'Keep Going', style: 'cancel' },
        { text: 'Cancel Quiz', style: 'destructive', onPress: async () => {
          try { await client.post(`/quizzes/${id}/cancel`); } catch {}
          router.back();
        }},
      ]
    );
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={C.accent} /></View>;
  }

  if (!session) return null;

  const q      = session.questions[current];
  const total  = session.questions.length;
  const answered = Object.keys(answers).length;
  const progress = current / (total - 1);
  const isTraining = session.session_type === 'training';

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={handleCancel}>
          <Ionicons name="close" size={24} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.headerTitle}>{q.item_number} / {total}</Text>
          {timeLeft !== null && (
            <Text style={[s.timer, timeLeft < 60 && { color: '#ff6b6b' }]}>{fmtTime(timeLeft)}</Text>
          )}
        </View>
        <Text style={s.answeredCount}>{answered}/{total}</Text>
      </View>

      {/* Progress Bar */}
      <View style={s.progressBg}>
        <GradientFill diagonal={false} style={[s.progressFill, { width: `${((current + 1) / total) * 100}%` }]} />
      </View>

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
          onPress={() => setCurrent(c => Math.max(0, c - 1))}
          disabled={current === 0}
        >
          <Ionicons name="arrow-back" size={20} color={current === 0 ? C.light : C.text} />
          <Text style={[s.navBtnText, current === 0 && { color: C.light }]}>Prev</Text>
        </TouchableOpacity>

        {current < total - 1 ? (
          <GradientButton radius={r.md} contentStyle={s.navBtnPrimary} onPress={() => setCurrent(c => c + 1)}>
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
  headerTitle:      { fontSize: 15, fontFamily: font.semiBold, color: C.text },
  timer:            { fontSize: 12, fontFamily: font.medium, color: C.muted, marginTop: 2 },
  answeredCount:    { fontSize: 13, fontFamily: font.regular, color: C.muted },
  progressBg:       { height: 3, backgroundColor: C.border },
  progressFill:     { height: 3 },
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
