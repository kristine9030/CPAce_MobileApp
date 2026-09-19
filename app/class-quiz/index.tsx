import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client from '@/lib/api/client';
import { C, sp, r, font, grad } from '@/constants/cpace-theme';
import { ScreenHeader } from '@/components/ui/screen-header';
import { GradientFill } from '@/components/ui/gradient';

interface Attempt {
  submitted: boolean;
  score: number;
  total_points: number;
  percent: number | null;
}

interface ClassQuiz {
  id: number;
  token: string;
  title: string;
  availability: 'open' | 'upcoming' | 'expired' | 'closed' | 'draft';
  due_on: string | null;
  time_limit_minutes: number | null;
  subject_code: string | null;
  faculty_name: string | null;
  items_count: number;
  attempt: Attempt | null;
}

/** Status pill shown on each quiz row — finished state wins over availability. */
function statusFor(quiz: ClassQuiz) {
  if (quiz.attempt?.submitted) {
    return { label: 'Completed', color: C.success, icon: 'checkmark-circle' as const };
  }
  switch (quiz.availability) {
    case 'open':     return { label: 'Open now',  color: C.accent,  icon: 'play-circle' as const };
    case 'upcoming': return { label: 'Upcoming',  color: C.warning, icon: 'time' as const };
    case 'expired':  return { label: 'Past due',  color: C.danger,  icon: 'alert-circle' as const };
    default:         return { label: 'Closed',    color: C.muted,   icon: 'lock-closed' as const };
  }
}

export default function ClassQuizzesScreen() {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<ClassQuiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefresh(true);
    try {
      const res = await client.get('/class-quizzes');
      setQuizzes(res.data.quizzes ?? []);
    } catch {}
    setLoading(false);
    setRefresh(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={C.accent} /></View>;
  }

  const openCount = quizzes.filter(q => q.availability === 'open' && !q.attempt?.submitted).length;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader
        title="Class Quizzes"
        subtitle={openCount > 0 ? `${openCount} waiting for you` : 'Quizzes from your instructors'}
        onBack={() => router.back()}
      />

      <FlatList
        data={quizzes}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: sp.md, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => load(true)} tintColor={C.accent} />}
        renderItem={({ item }) => {
          const status = statusFor(item);
          const done = item.attempt?.submitted;

          return (
            <TouchableOpacity
              style={s.card}
              activeOpacity={0.8}
              onPress={() => router.push({ pathname: '/class-quiz/[token]', params: { token: item.token } })}
            >
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.title} numberOfLines={2}>{item.title}</Text>
                  {item.faculty_name ? (
                    <Text style={s.faculty} numberOfLines={1}>{item.faculty_name}</Text>
                  ) : null}
                </View>
                {item.subject_code ? (
                  <GradientFill colors={grad.brandSoft} style={s.badge}>
                    <Text style={s.badgeText}>{item.subject_code}</Text>
                  </GradientFill>
                ) : null}
              </View>

              <View style={s.metaRow}>
                <View style={s.meta}>
                  <Ionicons name="help-circle-outline" size={14} color={C.muted} />
                  <Text style={s.metaText}>{item.items_count} item{item.items_count === 1 ? '' : 's'}</Text>
                </View>
                {item.time_limit_minutes ? (
                  <View style={s.meta}>
                    <Ionicons name="timer-outline" size={14} color={C.muted} />
                    <Text style={s.metaText}>{item.time_limit_minutes} min</Text>
                  </View>
                ) : null}
                {item.due_on ? (
                  <View style={s.meta}>
                    <Ionicons name="calendar-outline" size={14} color={C.muted} />
                    <Text style={s.metaText}>Due {item.due_on}</Text>
                  </View>
                ) : null}
              </View>

              <View style={s.cardFoot}>
                <View style={[s.status, { backgroundColor: status.color + '18' }]}>
                  <Ionicons name={status.icon} size={13} color={status.color} />
                  <Text style={[s.statusText, { color: status.color }]}>{status.label}</Text>
                </View>

                {done ? (
                  <Text style={s.score}>
                    {item.attempt!.score}/{item.attempt!.total_points}
                    <Text style={s.scorePct}>  ·  {Math.round(item.attempt!.percent ?? 0)}%</Text>
                  </Text>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={C.light} />
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={s.emptyBox}>
            <Ionicons name="clipboard-outline" size={48} color={C.light} />
            <Text style={s.emptyText}>
              No class quizzes yet.{'\n'}Your instructors&apos; quizzes will show up here.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: C.bg },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  card:      { backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.lg, padding: sp.md, marginBottom: sp.sm, borderWidth: 1, borderColor: C.border },
  cardTop:   { flexDirection: 'row', alignItems: 'flex-start', gap: sp.sm },
  title:     { fontSize: 15, fontFamily: font.bold, color: C.text, lineHeight: 21 },
  faculty:   { fontSize: 12, fontFamily: font.regular, color: C.muted, marginTop: 2 },
  badge:     { paddingHorizontal: sp.sm, paddingVertical: 3, borderRadius: r.sm, overflow: 'hidden' },
  badgeText: { fontSize: 11, fontFamily: font.bold, color: C.white },
  metaRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: sp.md, marginTop: sp.sm },
  meta:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:  { fontSize: 12, fontFamily: font.regular, color: C.muted },
  cardFoot:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: sp.sm, paddingTop: sp.sm, borderTopWidth: 1, borderTopColor: C.border },
  status:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: sp.sm, paddingVertical: 4, borderRadius: r.full },
  statusText:{ fontSize: 11.5, fontFamily: font.bold },
  score:     { fontSize: 14, fontFamily: font.bold, color: C.text },
  scorePct:  { fontSize: 12, fontFamily: font.medium, color: C.muted },
  emptyBox:  { alignItems: 'center', paddingTop: 60, gap: sp.md },
  emptyText: { fontSize: 14, fontFamily: font.regular, color: C.muted, textAlign: 'center', lineHeight: 21 },
});
