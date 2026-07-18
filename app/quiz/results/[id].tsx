import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client from '@/lib/api/client';
import { C, sp, r, sh } from '@/constants/cpace-theme';

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
  by_topic: Array<{ topic: string; correct: number; total: number; accuracy: number }>;
  question_details: Array<{
    item_number: number;
    question_text: string;
    your_answer: string | null;
    correct_answer: string;
    is_correct: boolean;
    explanation: string | null;
  }>;
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
          <TouchableOpacity style={s.backBtn} onPress={() => router.replace('/(tabs)')}>
            <Text style={s.backBtnText}>Go to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const pct    = Math.round(results.score_percent);
  const passed = results.passed;
  const scoreColor = passed ? C.success : pct >= 60 ? C.accent : C.danger;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)')}>
          <Ionicons name="home" size={24} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Quiz Results</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/quizzes')}>
          <Ionicons name="refresh" size={24} color={C.white} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: sp.xl }}>
        {/* Score Card */}
        <View style={[s.scoreCard, { backgroundColor: passed ? C.success : C.danger }]}>
          <Text style={s.scoreLabel}>{passed ? '🎉 PASSED' : '📚 KEEP STUDYING'}</Text>
          <Text style={s.scorePct}>{pct}%</Text>
          <Text style={s.scoreDetail}>{results.correct_answers} / {results.total_items} correct</Text>
          {results.points_earned > 0 && (
            <View style={s.pointsBadge}>
              <Ionicons name="star" size={14} color={C.warning} />
              <Text style={s.pointsText}>+{results.points_earned} points</Text>
            </View>
          )}
        </View>

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
            <Text style={s.qdCorrect}>Correct: <Text style={{ color: C.success, fontWeight: '700' }}>{qd.correct_answer}</Text></Text>
            {qd.explanation && <Text style={s.qdExpl}>{qd.explanation}</Text>}
          </View>
        ))}

        {/* Actions */}
        <View style={s.actionsRow}>
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: C.accent }]} onPress={() => router.push('/(tabs)/quizzes')}>
            <Ionicons name="refresh" size={18} color={C.white} />
            <Text style={s.actionBtnText}>New Quiz</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: C.primary }]} onPress={() => router.replace('/(tabs)')}>
            <Ionicons name="home" size={18} color={C.white} />
            <Text style={s.actionBtnText}>Dashboard</Text>
          </TouchableOpacity>
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
  errorText:   { fontSize: 16, color: C.muted },
  header:      { backgroundColor: C.primary, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: sp.lg, paddingVertical: sp.md },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.white },
  scoreCard:   { margin: sp.md, borderRadius: r.xl, padding: sp.xl, alignItems: 'center', ...sh.md },
  scoreLabel:  { fontSize: 16, fontWeight: '800', color: C.white, marginBottom: sp.sm },
  scorePct:    { fontSize: 56, fontWeight: '900', color: C.white },
  scoreDetail: { fontSize: 16, color: 'rgba(255,255,255,0.8)', marginTop: sp.xs },
  pointsBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: sp.md, paddingVertical: sp.xs, borderRadius: r.full, marginTop: sp.sm },
  pointsText:  { color: C.white, fontWeight: '700', fontSize: 14 },
  statsRow:    { flexDirection: 'row', marginHorizontal: sp.md, gap: sp.sm, marginBottom: sp.sm },
  statBox:     { flex: 1, backgroundColor: C.card, borderRadius: r.lg, padding: sp.sm, alignItems: 'center' },
  statVal:     { fontSize: 20, fontWeight: '800' },
  statLabel:   { fontSize: 11, color: C.muted, marginTop: 2 },
  card:        { backgroundColor: C.card, borderRadius: r.lg, padding: sp.md, marginHorizontal: sp.md, marginBottom: sp.sm },
  sectionTitle:{ fontSize: 15, fontWeight: '700', color: C.text },
  topicRow:    { flexDirection: 'row', alignItems: 'center', marginTop: sp.xs },
  topicName:   { width: 100, fontSize: 12, color: C.muted },
  topicBarBg:  { flex: 1, height: 6, backgroundColor: C.border, borderRadius: 3, marginHorizontal: sp.xs, overflow: 'hidden' },
  topicBarFill:{ height: 6, borderRadius: 3 },
  topicPct:    { width: 36, fontSize: 12, fontWeight: '700', textAlign: 'right', color: C.text },
  qdTop:       { flexDirection: 'row', alignItems: 'center', gap: sp.xs, marginBottom: sp.xs },
  qdBadge:     { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  qdNum:       { fontSize: 12, fontWeight: '700', color: C.muted },
  qdText:      { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: sp.xs },
  qdYours:     { fontSize: 13, color: C.muted, marginBottom: 2 },
  qdCorrect:   { fontSize: 13, color: C.muted, marginBottom: sp.xs },
  qdExpl:      { fontSize: 13, color: C.muted, fontStyle: 'italic', marginTop: sp.xs, borderTopWidth: 1, borderTopColor: C.border, paddingTop: sp.xs },
  actionsRow:  { flexDirection: 'row', margin: sp.md, gap: sp.sm },
  actionBtn:   { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: sp.xs, paddingVertical: 14, borderRadius: r.lg },
  actionBtnText:{ color: C.white, fontWeight: '700', fontSize: 15 },
  backBtn:     { backgroundColor: C.accent, paddingHorizontal: sp.xl, paddingVertical: sp.md, borderRadius: r.lg },
  backBtnText: { color: C.white, fontWeight: '700' },
});
