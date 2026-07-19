import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client from '@/lib/api/client';
import { C, sp, r, sh } from '@/constants/cpace-theme';

const W = Dimensions.get('window').width;

interface PerfData {
  overall_accuracy: number;
  total_sessions: number;
  total_questions: number;
  average_score: number;
  best_streak: number;
  study_hours: number;
  daily_series: Array<{ date: string; questions: number; accuracy: number }>;
  strengths:   Array<{ topic: string; subject_code: string; accuracy_rate: number; attempts: number }>;
  weaknesses:  Array<{ topic: string; subject_code: string; accuracy_rate: number; attempts: number }>;
  by_subject:  Array<{ subject_id: number; code: string; name: string; color: string; accuracy: number; sessions: number }>;
  by_quiz_type: Array<{ mode: string; sessions: number; avg_score: number }>;
}

export default function PerformanceScreen() {
  const router                = useRouter();
  const [data, setData]       = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefresh(true);
    try {
      const res = await client.get('/performance');
      setData(res.data);
    } catch {}
    setLoading(false);
    setRefresh(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={C.accent} /></View>;
  }

  const d = data!;
  const max7 = Math.max(...(d?.daily_series?.map(x => x.questions) ?? [1]), 1);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View style={s.headerTop}>
          <TouchableOpacity onPress={() => router.push('/(tabs)')} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color={C.white} />
          </TouchableOpacity>
          <Text style={s.title}>Performance</Text>
        </View>
        <Text style={s.sub}>Your learning analytics</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: sp.xl }}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => load(true)} tintColor={C.accent} />}
      >
        {/* Overview Cards */}
        <View style={s.grid}>
          <StatCard label="Accuracy"      value={`${Math.round(d?.overall_accuracy ?? 0)}%`}  color={C.success} />
          <StatCard label="Sessions"      value={String(d?.total_sessions ?? 0)}                color={C.accent} />
          <StatCard label="Questions"     value={String(d?.total_questions ?? 0)}               color={C.purple} />
          <StatCard label="Best Streak"   value={`${d?.best_streak ?? 0}d`}                    color={C.warning} />
        </View>

        {/* 7-Day Activity */}
        {d?.daily_series?.length > 0 && (
          <View style={[s.card, sh.sm]}>
            <Text style={s.sectionTitle}>7-Day Activity</Text>
            <View style={s.barChart}>
              {d.daily_series.map((day, i) => (
                <View key={i} style={s.barCol}>
                  <View style={s.barWrapper}>
                    <View style={[s.bar, { height: max7 > 0 ? (day.questions / max7) * 80 : 0, backgroundColor: C.accent }]} />
                  </View>
                  <Text style={s.barLabel}>{shortDate(day.date)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* By Subject */}
        {d?.by_subject?.length > 0 && (
          <View style={[s.card, sh.sm]}>
            <Text style={s.sectionTitle}>Accuracy by Subject</Text>
            {d.by_subject.map((sub) => (
              <View key={sub.subject_id} style={s.subRow}>
                <Text style={s.subCode}>{sub.code}</Text>
                <View style={s.subBarBg}>
                  <View style={[s.subBarFill, { width: `${sub.accuracy}%`, backgroundColor: sub.color || C.accent }]} />
                </View>
                <Text style={[s.subPct, { color: accColor(sub.accuracy) }]}>{Math.round(sub.accuracy)}%</Text>
              </View>
            ))}
          </View>
        )}

        {/* Strengths */}
        {d?.strengths?.length > 0 && (
          <View style={[s.card, sh.sm]}>
            <Text style={s.sectionTitle}>Strengths 💪</Text>
            {d.strengths.map((item, i) => (
              <TopicRow key={i} item={item} color={C.success} />
            ))}
          </View>
        )}

        {/* Weaknesses */}
        {d?.weaknesses?.length > 0 && (
          <View style={[s.card, sh.sm]}>
            <Text style={s.sectionTitle}>Needs Work 📚</Text>
            {d.weaknesses.map((item, i) => (
              <TopicRow key={i} item={item} color={C.danger} />
            ))}
          </View>
        )}

        {/* By Quiz Type */}
        {d?.by_quiz_type?.length > 0 && (
          <View style={[s.card, sh.sm]}>
            <Text style={s.sectionTitle}>By Quiz Mode</Text>
            {d.by_quiz_type.map((item, i) => (
              <View key={i} style={s.typeRow}>
                <Text style={s.typeMode}>{item.mode.charAt(0).toUpperCase() + item.mode.slice(1)}</Text>
                <Text style={s.typeSessions}>{item.sessions} sessions</Text>
                <Text style={[s.typeScore, { color: accColor(item.avg_score) }]}>{Math.round(item.avg_score)}%</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[s.statCard, sh.sm]}>
      <Text style={[s.statVal, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function TopicRow({ item, color }: { item: { topic: string; subject_code: string; accuracy_rate: number; attempts: number }; color: string }) {
  return (
    <View style={s.topicRow}>
      <View style={[s.topicDot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={s.topicName}>{item.topic}</Text>
        <Text style={s.topicSub}>{item.subject_code} · {item.attempts} attempts</Text>
      </View>
      <Text style={[s.topicPct, { color }]}>{Math.round(item.accuracy_rate * 100)}%</Text>
    </View>
  );
}

function shortDate(str: string) {
  const d = new Date(str);
  return d.toLocaleDateString('en-PH', { month: 'numeric', day: 'numeric' });
}
function accColor(pct: number) {
  return pct >= 75 ? C.success : pct >= 60 ? C.accent : C.danger;
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: C.bg },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  header:       { backgroundColor: C.primary, padding: sp.lg },
  headerTop:    { flexDirection: 'row', alignItems: 'center' },
  backBtn:      { width: 32, marginRight: sp.xs },
  title:        { fontSize: 24, fontWeight: '800', color: C.white },
  sub:          { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  grid:         { flexDirection: 'row', flexWrap: 'wrap', padding: sp.md, gap: sp.sm },
  statCard:     { flex: 1, minWidth: '45%', backgroundColor: C.card, borderRadius: r.lg, padding: sp.md, alignItems: 'center' },
  statVal:      { fontSize: 24, fontWeight: '800' },
  statLabel:    { fontSize: 12, color: C.muted, marginTop: 2 },
  card:         { backgroundColor: C.card, borderRadius: r.lg, padding: sp.md, marginHorizontal: sp.md, marginBottom: sp.md },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: sp.sm },
  barChart:     { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 100, marginTop: sp.xs },
  barCol:       { flex: 1, alignItems: 'center' },
  barWrapper:   { height: 80, justifyContent: 'flex-end', width: '60%' },
  bar:          { width: '100%', borderRadius: 3 },
  barLabel:     { fontSize: 9, color: C.muted, marginTop: 4 },
  subRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: sp.sm },
  subCode:      { width: 44, fontSize: 11, fontWeight: '700', color: C.muted },
  subBarBg:     { flex: 1, height: 6, backgroundColor: C.border, borderRadius: 3, marginHorizontal: sp.sm, overflow: 'hidden' },
  subBarFill:   { height: 6, borderRadius: 3 },
  subPct:       { width: 36, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  topicRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: sp.xs, borderBottomWidth: 1, borderBottomColor: C.border },
  topicDot:     { width: 8, height: 8, borderRadius: 4, marginRight: sp.sm },
  topicName:    { fontSize: 14, fontWeight: '600', color: C.text },
  topicSub:     { fontSize: 11, color: C.muted },
  topicPct:     { fontSize: 15, fontWeight: '800' },
  typeRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: sp.xs, borderBottomWidth: 1, borderBottomColor: C.border },
  typeMode:     { flex: 1, fontSize: 14, fontWeight: '600', color: C.text },
  typeSessions: { fontSize: 12, color: C.muted, marginRight: sp.md },
  typeScore:    { fontSize: 15, fontWeight: '800', width: 44, textAlign: 'right' },
});
