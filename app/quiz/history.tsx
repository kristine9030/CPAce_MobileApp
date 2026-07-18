import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client from '@/lib/api/client';
import { C, sp, r, sh } from '@/constants/cpace-theme';

interface HistorySession {
  id: number;
  mode: string;
  session_type: string;
  total_items: number;
  correct_answers: number;
  score_percent: number;
  started_at: string;
  completed_at: string;
  subject_code: string | null;
}

const MODES: Record<string, string> = {
  adaptive: 'Adaptive', topic: 'Topic', timed: 'Timed', challenge: 'Challenge',
};

const MODE_COLORS: Record<string, string> = {
  adaptive: C.success, topic: C.accent, timed: C.warning, challenge: C.danger,
};

export default function QuizHistoryScreen() {
  const router                  = useRouter();
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refresh, setRefresh]   = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefresh(true);
    try {
      const res = await client.get('/quizzes/history');
      setSessions(res.data.sessions ?? res.data);
    } catch {}
    setLoading(false);
    setRefresh(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={C.accent} /></View>;
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color={C.white} />
        </TouchableOpacity>
        <Text style={s.title}>Quiz History</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={sessions}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: sp.md }}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => load(true)} tintColor={C.accent} />}
        renderItem={({ item }) => {
          const modeColor = MODE_COLORS[item.mode] ?? C.accent;
          const pct = item.score_percent != null ? Math.round(item.score_percent) : null;
          return (
            <TouchableOpacity style={[s.card, sh.sm]} onPress={() => router.push({ pathname: '/quiz/results/[id]', params: { id: String(item.id) } })}>
              <View style={[s.modeTag, { backgroundColor: modeColor + '20' }]}>
                <Text style={[s.modeText, { color: modeColor }]}>{MODES[item.mode] ?? item.mode}</Text>
              </View>
              <View style={s.middle}>
                <Text style={s.subject}>{item.subject_code ?? 'Mixed'}</Text>
                <Text style={s.detail}>{item.correct_answers} / {item.total_items} correct</Text>
                <Text style={s.date}>{fmtDate(item.started_at)}</Text>
              </View>
              {pct !== null && (
                <Text style={[s.score, { color: scoreColor(pct) }]}>{pct}%</Text>
              )}
              <Ionicons name="chevron-forward" size={16} color={C.light} />
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="time-outline" size={48} color={C.light} />
            <Text style={s.emptyText}>No quiz history yet.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function fmtDate(str: string) {
  return new Date(str).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function scoreColor(pct: number) {
  return pct >= 75 ? C.success : pct >= 60 ? C.accent : C.danger;
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: C.bg },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  header:    { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: sp.lg, paddingVertical: sp.md },
  backBtn:   { width: 40 },
  title:     { flex: 1, fontSize: 18, fontWeight: '700', color: C.white, textAlign: 'center' },
  card:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: r.lg, padding: sp.md, marginBottom: sp.sm },
  modeTag:   { paddingHorizontal: sp.sm, paddingVertical: sp.xs, borderRadius: r.sm, marginRight: sp.sm },
  modeText:  { fontSize: 11, fontWeight: '700' },
  middle:    { flex: 1 },
  subject:   { fontSize: 14, fontWeight: '700', color: C.text },
  detail:    { fontSize: 12, color: C.muted },
  date:      { fontSize: 11, color: C.light, marginTop: 2 },
  score:     { fontSize: 20, fontWeight: '800', marginRight: sp.sm },
  empty:     { alignItems: 'center', paddingTop: 60, gap: sp.md },
  emptyText: { fontSize: 14, color: C.muted },
});
