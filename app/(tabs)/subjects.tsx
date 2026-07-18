import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client from '@/lib/api/client';
import { C, sp, r, sh } from '@/constants/cpace-theme';

interface Subject {
  id: number;
  code: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  question_count: number;
  mastery: number;
}

const ICONS: Record<string, any> = {
  calculator: 'calculator', book: 'book', briefcase: 'briefcase',
  'trending-up': 'trending-up', default: 'library',
};

export default function SubjectsScreen() {
  const router                  = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refresh, setRefresh]   = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefresh(true);
    try {
      const res = await client.get('/subjects');
      setSubjects(res.data.subjects ?? res.data);
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
        <Text style={s.title}>Subjects</Text>
        <Text style={s.sub}>Choose a subject to study</Text>
      </View>

      <FlatList
        data={subjects}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: sp.md }}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => load(true)} tintColor={C.accent} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[s.card, sh.sm]}
            onPress={() => router.push({ pathname: '/(tabs)/quizzes', params: { subjectId: item.id, subjectCode: item.code } })}
          >
            <View style={[s.iconBox, { backgroundColor: (item.color || C.accent) + '20' }]}>
              <Ionicons name={ICONS[item.icon] ?? ICONS.default} size={24} color={item.color || C.accent} />
            </View>
            <View style={{ flex: 1, marginLeft: sp.md }}>
              <Text style={s.code}>{item.code}</Text>
              <Text style={s.name}>{item.name}</Text>
              <Text style={s.desc} numberOfLines={1}>{item.description}</Text>
              <View style={s.rowBetween}>
                <Text style={s.questionCount}>{item.question_count} questions</Text>
                <View style={[s.masteryBadge, { backgroundColor: masteryColor(item.mastery) + '20' }]}>
                  <Text style={[s.masteryPct, { color: masteryColor(item.mastery) }]}>{item.mastery}% mastery</Text>
                </View>
              </View>
              <View style={s.barBg}>
                <View style={[s.barFill, { width: `${item.mastery}%`, backgroundColor: item.color || C.accent }]} />
              </View>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={s.empty}>No subjects found.</Text>}
      />
    </SafeAreaView>
  );
}

function masteryColor(pct: number) {
  if (pct >= 75) return C.success;
  if (pct >= 50) return C.accent;
  if (pct >= 25) return C.warning;
  return C.danger;
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: C.bg },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  header:       { backgroundColor: C.primary, padding: sp.lg },
  title:        { fontSize: 24, fontWeight: '800', color: C.white },
  sub:          { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  card:         { flexDirection: 'row', backgroundColor: C.card, borderRadius: r.lg, padding: sp.md, marginBottom: sp.sm, alignItems: 'flex-start' },
  iconBox:      { width: 48, height: 48, borderRadius: r.md, justifyContent: 'center', alignItems: 'center' },
  code:         { fontSize: 11, fontWeight: '700', color: C.muted, letterSpacing: 1 },
  name:         { fontSize: 15, fontWeight: '700', color: C.text, marginTop: 2 },
  desc:         { fontSize: 12, color: C.muted, marginTop: 2 },
  rowBetween:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: sp.xs },
  questionCount:{ fontSize: 12, color: C.muted },
  masteryBadge: { paddingHorizontal: sp.sm, paddingVertical: 2, borderRadius: r.full },
  masteryPct:   { fontSize: 11, fontWeight: '700' },
  barBg:        { height: 4, backgroundColor: C.border, borderRadius: 2, marginTop: sp.xs, overflow: 'hidden' },
  barFill:      { height: 4, borderRadius: 2 },
  empty:        { textAlign: 'center', color: C.muted, marginTop: 40 },
});
