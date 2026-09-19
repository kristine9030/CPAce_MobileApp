import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client from '@/lib/api/client';
import { C, sp, r, font, grad } from '@/constants/cpace-theme';
import { ScreenHeader } from '@/components/ui/screen-header';
import { GradientButton, GradientFill } from '@/components/ui/gradient';

interface Quiz {
  title: string;
  instructions: string | null;
  availability: string;
  due_on: string | null;
  time_limit_minutes: number | null;
  subject_code: string | null;
  subject_name: string | null;
  faculty_name: string | null;
  items_count: number;
  total_points: number;
  show_results: boolean;
}

interface Attempt {
  submitted: boolean;
  score: number;
  total_points: number;
  percent: number | null;
}

export default function ClassQuizLandingScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();

  const [quiz, setQuiz]       = useState<Quiz | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [canStart, setCanStart] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await client.get(`/class-quizzes/${token}`);
      setQuiz(res.data.quiz);
      setAttempt(res.data.attempt);
      setCanStart(res.data.can_start);
      setBlocked(res.data.unavailable_message);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not load this quiz.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const start = async () => {
    setStarting(true);
    try {
      await client.post(`/class-quizzes/${token}/start`);
      router.push({ pathname: '/class-quiz/take', params: { token: String(token) } });
    } catch (err: any) {
      // A quiz submitted from another device lands here — send them to the result.
      if (err.response?.data?.submitted) {
        router.replace({ pathname: '/class-quiz/result', params: { token: String(token) } });
        return;
      }
      Alert.alert('Cannot start', err.message || 'Could not start this quiz.');
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={C.accent} /></View>;
  }
  if (!quiz) return null;

  const done = attempt?.submitted;
  const inProgress = attempt && !attempt.submitted;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title="Class Quiz" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={{ padding: sp.md, paddingBottom: 120 }}>
        <View style={s.hero}>
          {quiz.subject_code ? (
            <GradientFill colors={grad.brandSoft} style={s.badge}>
              <Text style={s.badgeText}>{quiz.subject_code}</Text>
            </GradientFill>
          ) : null}
          <Text style={s.title}>{quiz.title}</Text>
          {quiz.faculty_name ? <Text style={s.faculty}>by {quiz.faculty_name}</Text> : null}
        </View>

        {/* At-a-glance facts */}
        <View style={s.statRow}>
          <View style={s.stat}>
            <Ionicons name="help-circle-outline" size={20} color={C.accent} />
            <Text style={s.statValue}>{quiz.items_count}</Text>
            <Text style={s.statLabel}>Questions</Text>
          </View>
          <View style={s.stat}>
            <Ionicons name="star-outline" size={20} color={C.accent} />
            <Text style={s.statValue}>{quiz.total_points}</Text>
            <Text style={s.statLabel}>Points</Text>
          </View>
          <View style={s.stat}>
            <Ionicons name="timer-outline" size={20} color={C.accent} />
            <Text style={s.statValue}>{quiz.time_limit_minutes ? quiz.time_limit_minutes : '—'}</Text>
            <Text style={s.statLabel}>{quiz.time_limit_minutes ? 'Minutes' : 'Untimed'}</Text>
          </View>
        </View>

        {quiz.due_on ? (
          <View style={s.dueRow}>
            <Ionicons name="calendar-outline" size={15} color={C.muted} />
            <Text style={s.dueText}>Due {quiz.due_on}</Text>
          </View>
        ) : null}

        {quiz.instructions ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Instructions</Text>
            <Text style={s.cardBody}>{quiz.instructions}</Text>
          </View>
        ) : null}

        {/* Result summary once submitted */}
        {done ? (
          <View style={[s.card, s.resultCard]}>
            <Ionicons name="checkmark-circle" size={28} color={C.success} />
            <Text style={s.resultTitle}>You&apos;ve completed this quiz</Text>
            <Text style={s.resultScore}>
              {attempt!.score} / {attempt!.total_points}
              <Text style={s.resultPct}>  ·  {Math.round(attempt!.percent ?? 0)}%</Text>
            </Text>
          </View>
        ) : null}

        {/* Why they can't start, when that's the case */}
        {!done && blocked ? (
          <View style={[s.card, s.blockedCard]}>
            <Ionicons name="information-circle" size={20} color={C.warning} />
            <Text style={s.blockedText}>{blocked}</Text>
          </View>
        ) : null}

        {/* One-attempt warning, so starting is never a surprise */}
        {canStart && !inProgress ? (
          <View style={s.noteRow}>
            <Ionicons name="alert-circle-outline" size={15} color={C.muted} />
            <Text style={s.noteText}>
              You get one attempt. {quiz.time_limit_minutes
                ? `The ${quiz.time_limit_minutes}-minute timer starts as soon as you begin.`
                : 'Make sure you have time to finish.'}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Action bar */}
      <View style={s.footer}>
        {done ? (
          quiz.show_results ? (
            <GradientButton
              radius={r.lg}
              contentStyle={s.actionBtn}
              onPress={() => router.push({ pathname: '/class-quiz/result', params: { token: String(token) } })}
            >
              <Ionicons name="bar-chart" size={20} color={C.white} />
              <Text style={s.actionText}>View Results</Text>
            </GradientButton>
          ) : (
            <Text style={s.footerNote}>Your instructor has turned off the answer review for this quiz.</Text>
          )
        ) : canStart ? (
          <GradientButton
            radius={r.lg}
            colors={grad.brand}
            contentStyle={s.actionBtn}
            onPress={start}
            loading={starting}
          >
            <Ionicons name="play" size={20} color={C.white} />
            <Text style={s.actionText}>{inProgress ? 'Resume Quiz' : 'Start Quiz'}</Text>
          </GradientButton>
        ) : (
          <View style={s.disabledBtn}>
            <Ionicons name="lock-closed" size={18} color={C.light} />
            <Text style={s.disabledText}>Not available</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: C.bg },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  hero:       { alignItems: 'center', paddingVertical: sp.md, gap: 6 },
  badge:      { paddingHorizontal: sp.sm, paddingVertical: 3, borderRadius: r.sm, overflow: 'hidden' },
  badgeText:  { fontSize: 11, fontFamily: font.bold, color: C.white },
  title:      { fontSize: 20, fontFamily: font.extraBold, color: C.text, textAlign: 'center', lineHeight: 27 },
  faculty:    { fontSize: 13, fontFamily: font.regular, color: C.muted },
  statRow:    { flexDirection: 'row', gap: sp.sm, marginTop: sp.sm },
  stat:       { flex: 1, alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.lg, paddingVertical: sp.md, borderWidth: 1, borderColor: C.border },
  statValue:  { fontSize: 20, fontFamily: font.extraBold, color: C.text },
  statLabel:  { fontSize: 11, fontFamily: font.medium, color: C.muted },
  dueRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: sp.md },
  dueText:    { fontSize: 13, fontFamily: font.semiBold, color: C.muted },
  card:       { backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.lg, padding: sp.md, marginTop: sp.md, borderWidth: 1, borderColor: C.border },
  cardTitle:  { fontSize: 14, fontFamily: font.bold, color: C.text, marginBottom: 6 },
  cardBody:   { fontSize: 14, fontFamily: font.regular, color: C.muted, lineHeight: 21 },
  resultCard: { alignItems: 'center', gap: 6 },
  resultTitle:{ fontSize: 14, fontFamily: font.semiBold, color: C.text },
  resultScore:{ fontSize: 22, fontFamily: font.extraBold, color: C.text },
  resultPct:  { fontSize: 15, fontFamily: font.medium, color: C.muted },
  blockedCard:{ flexDirection: 'row', alignItems: 'center', gap: sp.sm, backgroundColor: 'rgba(232,145,11,0.08)', borderColor: 'rgba(232,145,11,0.25)' },
  blockedText:{ flex: 1, fontSize: 13, fontFamily: font.medium, color: C.text, lineHeight: 19 },
  noteRow:    { flexDirection: 'row', gap: 6, marginTop: sp.md, paddingHorizontal: sp.xs },
  noteText:   { flex: 1, fontSize: 12.5, fontFamily: font.regular, color: C.muted, lineHeight: 18, fontStyle: 'italic' },
  footer:     { padding: sp.md, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.card },
  actionBtn:  { paddingVertical: 15, gap: sp.sm },
  actionText: { color: C.white, fontSize: 16, fontFamily: font.extraBold },
  footerNote: { fontSize: 13, fontFamily: font.regular, color: C.muted, textAlign: 'center', paddingVertical: sp.sm },
  disabledBtn:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp.sm, paddingVertical: 15, borderRadius: r.lg, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
  disabledText:{ fontSize: 15, fontFamily: font.bold, color: C.light },
});
