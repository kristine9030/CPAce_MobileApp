import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client from '@/lib/api/client';
import { C, sp, r, sh, font, type, grad } from '@/constants/cpace-theme';
import { GradientButton, GradientFill } from '@/components/ui/gradient';

interface Results {
  session_id: number;
  mode: string;
  total_items: number;
  correct_answers: number;
  incorrect_answers: number;
  skipped_answers: number;
  score_percent: number;
  points_earned: number;
  time_taken_seconds: number;
  passed: boolean;
  by_topic: { topic: string; correct: number; total: number; accuracy: number }[];
  question_details: {
    item_number: number;
    question_text: string;
    your_answer: string | null;
    correct_answer: string;
    is_correct: boolean;
    explanation: string | null;
  }[];
}

export default function QuizResultsScreen() {
  const { id }                  = useLocalSearchParams<{ id: string }>();
  const router                  = useRouter();
  const [results, setResults]   = useState<Results | null>(null);
  const [loading, setLoading]   = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await client.get(`/quizzes/${id}/results`);
        setResults(res.data);
      } catch (err: any) {
        // session might not be complete yet — try fetching quiz history
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={C.accent} /></View>;
  }

  if (!results) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <Text style={s.errorText}>Results not available.</Text>
          <GradientButton radius={r.lg} contentStyle={s.backBtn} onPress={() => router.replace('/(tabs)')}>
            <Text style={s.backBtnText}>Go to Dashboard</Text>
          </GradientButton>
        </View>
      </SafeAreaView>
    );
  }

  const pct    = Math.round(results.score_percent);
  const passed = results.passed;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)')}>
          <Ionicons name="home" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Quiz Results</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/quizzes')}>
          <Ionicons name="refresh" size={24} color={C.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: sp.xl }}>
        {/* Score Card */}
        <GradientFill colors={passed ? grad.success : grad.danger} style={s.scoreCard}>
          <Text style={s.scoreLabel}>{passed ? '🎉 PASSED' : '📚 KEEP STUDYING'}</Text>
          <Text style={s.scorePct}>{pct}%</Text>
          <Text style={s.scoreDetail}>{results.correct_answers} / {results.total_items} correct</Text>
          {results.points_earned > 0 && (
            <View style={s.pointsBadge}>
              <Ionicons name="star" size={14} color={C.warning} />
              <Text style={s.pointsText}>+{results.points_earned} points</Text>
            </View>
          )}
        </GradientFill>

        {/* Stats Row */}
        <View style={s.statsRow}>
          <StatBox label="Correct"   value={String(results.correct_answers)}   color={C.success} />
          <StatBox label="Wrong"     value={String(results.incorrect_answers)}  color={C.danger} />
          <StatBox label="Skipped"   value={String(results.skipped_answers)}    color={C.muted} />
          <StatBox label="Time"      value={fmtSec(results.time_taken_seconds)} color={C.accent} />
        </View>

        {/* By Topic */}
        {results.by_topic?.length > 0 && (
          <View style={[s.card, sh.sm]}>
            <Text style={s.sectionTitle}>Performance by Topic</Text>
            {results.by_topic.map((t, i) => (
              <View key={i} style={s.topicRow}>
                <Text style={s.topicName} numberOfLines={1}>{t.topic}</Text>
                <View style={s.topicBarBg}>
                  <View style={[s.topicBarFill, { width: `${t.accuracy * 100}%`, backgroundColor: t.accuracy >= 0.75 ? C.success : t.accuracy >= 0.6 ? C.accent : C.danger }]} />
                </View>
                <Text style={s.topicPct}>{Math.round(t.accuracy * 100)}%</Text>
              </View>
            ))}
          </View>
        )}

        {/* Question Review */}
        <TouchableOpacity style={[s.card, sh.sm, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]} onPress={() => setShowDetails(v => !v)}>
          <Text style={s.sectionTitle}>Review Answers</Text>
          <Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={20} color={C.muted} />
        </TouchableOpacity>

        {showDetails && results.question_details?.map((qd, i) => (
          <View key={i} style={[s.card, sh.sm, { borderLeftWidth: 4, borderLeftColor: qd.is_correct ? C.success : C.danger }]}>
            <View style={s.qdTop}>
              <View style={[s.qdBadge, { backgroundColor: qd.is_correct ? C.success + '20' : C.danger + '20' }]}>
                <Ionicons name={qd.is_correct ? 'checkmark' : 'close'} size={14} color={qd.is_correct ? C.success : C.danger} />
              </View>
              <Text style={s.qdNum}>#{qd.item_number}</Text>
            </View>
            <Text style={s.qdText}>{qd.question_text}</Text>
            {!qd.is_correct && qd.your_answer && (
              <Text style={s.qdYours}>Your answer: <Text style={{ color: C.danger }}>{qd.your_answer}</Text></Text>
            )}
            <Text style={s.qdCorrect}>Correct: <Text style={{ color: C.success, fontFamily: font.bold }}>{qd.correct_answer}</Text></Text>
            {qd.explanation && <Text style={s.qdExpl}>{qd.explanation}</Text>}
          </View>
        ))}

        {/* Actions */}
        <View style={s.actionsRow}>
          <GradientButton
            radius={r.lg}
            colors={grad.brandSoft}
            style={{ flex: 1 }}
            contentStyle={s.actionBtn}
            onPress={() => router.push('/(tabs)/quizzes')}
          >
            <Ionicons name="refresh" size={18} color={C.white} />
            <Text style={s.actionBtnText}>New Quiz</Text>
          </GradientButton>
          <GradientButton
            radius={r.lg}
            style={{ flex: 1 }}
            contentStyle={s.actionBtn}
            onPress={() => router.replace('/(tabs)')}
          >
            <Ionicons name="home" size={18} color={C.white} />
            <Text style={s.actionBtnText}>Dashboard</Text>
          </GradientButton>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[s.statBox, sh.sm]}>
      <Text style={[s.statVal, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function fmtSec(s: number) {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m${sec}s` : `${sec}s`;
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: C.bg },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg, gap: sp.md },
  errorText:   { fontSize: 16, fontFamily: font.regular, color: C.muted },
  header:      { backgroundColor: C.bg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: sp.lg, paddingVertical: sp.md },
  headerTitle: { fontSize: 17, fontFamily: font.semiBold, color: C.text },
  scoreCard:   { margin: sp.md, borderRadius: r.xl, padding: sp.xl, alignItems: 'center', },
  scoreLabel:  { fontSize: 16, fontFamily: font.extraBold, color: C.white, marginBottom: sp.sm },
  scorePct:    { fontSize: 56, fontFamily: font.black, color: C.white },
  scoreDetail: { fontSize: 16, fontFamily: font.regular, color: 'rgba(255,255,255,0.8)', marginTop: sp.xs },
  pointsBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: sp.md, paddingVertical: sp.xs, borderRadius: r.full, marginTop: sp.sm },
  pointsText:  { color: C.white, fontFamily: font.bold, fontSize: 14 },
  statsRow:    { flexDirection: 'row', marginHorizontal: sp.md, gap: sp.sm, marginBottom: sp.sm },
  statBox:     { flex: 1, backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.lg, padding: sp.sm, alignItems: 'center', },
  statVal:     { fontSize: 20, fontFamily: font.extraBold },
  statLabel:   { fontSize: 11, fontFamily: font.medium, color: C.muted, marginTop: 2 },
  card:        { backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.lg, padding: sp.md, marginHorizontal: sp.md, marginBottom: sp.sm, },
  sectionTitle:{ ...type.sectionTitle },
  topicRow:    { flexDirection: 'row', alignItems: 'center', marginTop: sp.xs },
  topicName:   { width: 100, fontSize: 12, fontFamily: font.regular, color: C.muted },
  topicBarBg:  { flex: 1, height: 6, backgroundColor: C.border, borderRadius: 3, marginHorizontal: sp.xs, overflow: 'hidden' },
  topicBarFill:{ height: 6, borderRadius: 3 },
  topicPct:    { width: 36, fontSize: 12, fontFamily: font.bold, textAlign: 'right', color: C.text },
  qdTop:       { flexDirection: 'row', alignItems: 'center', gap: sp.xs, marginBottom: sp.xs },
  qdBadge:     { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  qdNum:       { fontSize: 12, fontFamily: font.bold, color: C.muted },
  qdText:      { fontSize: 14, fontFamily: font.semiBold, color: C.text, marginBottom: sp.xs },
  qdYours:     { fontSize: 13, fontFamily: font.regular, color: C.muted, marginBottom: 2 },
  qdCorrect:   { fontSize: 13, fontFamily: font.regular, color: C.muted, marginBottom: sp.xs },
  qdExpl:      { fontSize: 13, fontFamily: font.regular, color: C.muted, fontStyle: 'italic', marginTop: sp.xs, borderTopWidth: 1, borderTopColor: C.border, paddingTop: sp.xs },
  actionsRow:  { flexDirection: 'row', margin: sp.md, gap: sp.sm },
  actionBtn:   { gap: sp.xs, paddingVertical: 14 },
  actionBtnText:{ color: C.white, fontFamily: font.bold, fontSize: 15 },
  backBtn:     { paddingHorizontal: sp.xl, paddingVertical: sp.md },
  backBtnText: { color: C.white, fontFamily: font.bold },
});
