import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client from '@/lib/api/client';
import { C, sp, r, font, grad } from '@/constants/cpace-theme';
import { ScreenHeader } from '@/components/ui/screen-header';
import { GradientButton, GradientFill } from '@/components/ui/gradient';

interface Choice { label: string; text: string }
interface ResultItem {
  id: number;
  question_text: string;
  points: number;
  choices: Choice[];
  selected_label: string | null;
  correct_label: string | null;
  is_correct: boolean;
  explanation: string | null;
}

export default function ClassQuizResultScreen() {
  const { token, auto } = useLocalSearchParams<{ token: string; auto?: string }>();
  const router = useRouter();

  const [quiz, setQuiz]       = useState<any>(null);
  const [attempt, setAttempt] = useState<any>(null);
  const [items, setItems]     = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await client.get(`/class-quizzes/${token}/result`);
        if (!alive) return;
        setQuiz(res.data.quiz);
        setAttempt(res.data.attempt);
        setItems(res.data.items ?? []);
      } catch (err: any) {
        if (!alive) return;
        Alert.alert('Error', err.message || 'Could not load your result.', [
          { text: 'OK', onPress: () => router.replace('/class-quiz' as any) },
        ]);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [token]);

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={C.accent} /></View>;
  }
  if (!quiz || !attempt) return null;

  const percent = Math.round(attempt.percent ?? 0);
  const passed = percent >= 75;
  const correctCount = items.filter((i) => i.is_correct).length;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader
        title="Quiz Result"
        subtitle={quiz.title}
        onBack={() => router.replace('/class-quiz' as any)}
      />

      <ScrollView contentContainerStyle={{ padding: sp.md, paddingBottom: 120 }}>
        {auto === '1' ? (
          <View style={s.autoBanner}>
            <Ionicons name="timer-outline" size={16} color={C.warning} />
            <Text style={s.autoText}>Time ran out — your answers were submitted automatically.</Text>
          </View>
        ) : null}

        {/* Score hero */}
        <GradientFill
          colors={passed ? grad.success : grad.brand}
          style={s.hero}
        >
          <Text style={s.heroPct}>{percent}%</Text>
          <Text style={s.heroScore}>{attempt.score} of {attempt.total_points} points</Text>
          <View style={s.heroBadge}>
            <Ionicons name={passed ? 'trophy' : 'trending-up'} size={14} color={C.white} />
            <Text style={s.heroBadgeText}>{passed ? 'Passed' : 'Keep practicing'}</Text>
          </View>
        </GradientFill>

        {items.length > 0 ? (
          <>
            <View style={s.summaryRow}>
              <View style={s.summary}>
                <Text style={[s.summaryValue, { color: C.success }]}>{correctCount}</Text>
                <Text style={s.summaryLabel}>Correct</Text>
              </View>
              <View style={s.summary}>
                <Text style={[s.summaryValue, { color: C.danger }]}>{items.length - correctCount}</Text>
                <Text style={s.summaryLabel}>Incorrect</Text>
              </View>
              <View style={s.summary}>
                <Text style={s.summaryValue}>{items.length}</Text>
                <Text style={s.summaryLabel}>Total</Text>
              </View>
            </View>

            <Text style={s.sectionTitle}>Answer Review</Text>

            {items.map((item, idx) => (
              <View key={item.id} style={s.card}>
                <View style={s.cardHead}>
                  <View style={[s.numBadge, { backgroundColor: item.is_correct ? C.success : C.danger }]}>
                    <Text style={s.numBadgeText}>{idx + 1}</Text>
                  </View>
                  <Text style={s.question}>{item.question_text}</Text>
                </View>

                {item.choices.map((choice) => {
                  const isCorrect = choice.label === item.correct_label;
                  const isMine = choice.label === item.selected_label;
                  const wrongPick = isMine && !isCorrect;

                  return (
                    <View
                      key={choice.label}
                      style={[
                        s.choice,
                        isCorrect && s.choiceCorrect,
                        wrongPick && s.choiceWrong,
                      ]}
                    >
                      <Text style={[
                        s.choiceLabel,
                        isCorrect && { color: C.success },
                        wrongPick && { color: C.danger },
                      ]}>{choice.label}</Text>
                      <Text style={[
                        s.choiceText,
                        (isCorrect || wrongPick) && { fontFamily: font.semiBold },
                      ]}>{choice.text}</Text>
                      {isCorrect ? <Ionicons name="checkmark-circle" size={18} color={C.success} /> : null}
                      {wrongPick ? <Ionicons name="close-circle" size={18} color={C.danger} /> : null}
                    </View>
                  );
                })}

                {!item.selected_label ? (
                  <Text style={s.skipped}>You skipped this question.</Text>
                ) : null}

                {item.explanation ? (
                  <View style={s.explain}>
                    <Text style={s.explainTitle}>Explanation</Text>
                    <Text style={s.explainText}>{item.explanation}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </>
        ) : (
          <View style={s.hiddenCard}>
            <Ionicons name="eye-off-outline" size={28} color={C.light} />
            <Text style={s.hiddenText}>
              Your instructor has turned off the answer review for this quiz, so only your score is shown.
            </Text>
          </View>
        )}

        <GradientButton
          radius={r.lg}
          style={{ marginTop: sp.lg }}
          contentStyle={s.doneBtn}
          onPress={() => router.replace('/class-quiz' as any)}
        >
          <Ionicons name="checkmark-done" size={20} color={C.white} />
          <Text style={s.doneText}>Back to Class Quizzes</Text>
        </GradientButton>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: C.bg },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  autoBanner:  { flexDirection: 'row', alignItems: 'center', gap: sp.sm, backgroundColor: 'rgba(232,145,11,0.10)', borderRadius: r.md, padding: sp.sm, marginBottom: sp.md, borderWidth: 1, borderColor: 'rgba(232,145,11,0.25)' },
  autoText:    { flex: 1, fontSize: 12.5, fontFamily: font.medium, color: C.text },
  hero:        { alignItems: 'center', borderRadius: r.xl, paddingVertical: sp.xl, gap: 4, overflow: 'hidden' },
  heroPct:     { fontSize: 46, fontFamily: font.black, color: C.white },
  heroScore:   { fontSize: 14, fontFamily: font.medium, color: 'rgba(255,255,255,0.9)' },
  heroBadge:   { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: sp.md, paddingVertical: 5, borderRadius: r.full, marginTop: sp.sm },
  heroBadgeText:{ fontSize: 12, fontFamily: font.bold, color: C.white },
  summaryRow:  { flexDirection: 'row', gap: sp.sm, marginTop: sp.md },
  summary:     { flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.lg, paddingVertical: sp.md, borderWidth: 1, borderColor: C.border },
  summaryValue:{ fontSize: 22, fontFamily: font.extraBold, color: C.text },
  summaryLabel:{ fontSize: 11, fontFamily: font.medium, color: C.muted, marginTop: 2 },
  sectionTitle:{ fontSize: 15, fontFamily: font.bold, color: C.text, marginTop: sp.lg, marginBottom: sp.sm },
  card:        { backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.lg, padding: sp.md, marginBottom: sp.sm, borderWidth: 1, borderColor: C.border },
  cardHead:    { flexDirection: 'row', gap: sp.sm, marginBottom: sp.sm },
  numBadge:    { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  numBadgeText:{ fontSize: 11, fontFamily: font.bold, color: C.white },
  question:    { flex: 1, fontSize: 14.5, fontFamily: font.semiBold, color: C.text, lineHeight: 21 },
  choice:      { flexDirection: 'row', alignItems: 'center', gap: sp.sm, borderRadius: r.md, paddingHorizontal: sp.sm, paddingVertical: 9, marginBottom: 5, borderWidth: 1, borderColor: 'transparent', backgroundColor: 'rgba(0,0,0,0.02)' },
  choiceCorrect:{ borderColor: 'rgba(33,163,102,0.35)', backgroundColor: 'rgba(33,163,102,0.08)' },
  choiceWrong: { borderColor: 'rgba(192,57,43,0.35)', backgroundColor: 'rgba(192,57,43,0.07)' },
  choiceLabel: { fontSize: 12, fontFamily: font.bold, color: C.muted, width: 16 },
  choiceText:  { flex: 1, fontSize: 13.5, fontFamily: font.regular, color: C.text, lineHeight: 19 },
  skipped:     { fontSize: 12, fontFamily: font.medium, color: C.warning, marginTop: 4, fontStyle: 'italic' },
  explain:     { marginTop: sp.sm, paddingTop: sp.sm, borderTopWidth: 1, borderTopColor: C.border },
  explainTitle:{ fontSize: 12, fontFamily: font.bold, color: C.text, marginBottom: 3 },
  explainText: { fontSize: 13, fontFamily: font.regular, color: C.muted, lineHeight: 19 },
  hiddenCard:  { alignItems: 'center', gap: sp.sm, backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.lg, padding: sp.lg, marginTop: sp.md, borderWidth: 1, borderColor: C.border },
  hiddenText:  { fontSize: 13, fontFamily: font.regular, color: C.muted, textAlign: 'center', lineHeight: 20 },
  doneBtn:     { paddingVertical: 15, gap: sp.sm },
  doneText:    { color: C.white, fontSize: 16, fontFamily: font.extraBold },
});
