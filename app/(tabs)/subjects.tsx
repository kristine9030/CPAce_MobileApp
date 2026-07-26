import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client from '@/lib/api/client';
import { C, sp, r, font, grad } from '@/constants/cpace-theme';
import { ScreenHeader } from '@/components/ui/screen-header';
import { GradientBorder, GradientButton, GradientFill } from '@/components/ui/gradient';

interface Topic {
  id: number;
  name: string;
  description: string;
  question_count: number;
  material_count: number;
  mastery: number;
  is_weak?: boolean;
}

interface Subject {
  id: number;
  code: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  topic_count?: number;
  question_count: number;
  weak_count?: number;
  mastery: number;
  topics?: Topic[];
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

  // Same destination as the web's "Review Subject" link: the topic list.
  const openSubject = (item: Subject) => router.push({
    pathname: '/subject-detail',
    params: {
      subjectId:   String(item.id),
      subjectCode: item.code,
      subjectName: item.name,
    },
  });

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={C.accent} /></View>;
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader
        title="Subjects"
        subtitle="Review by subject area."
        onBack={() => router.push('/(tabs)')}
      />

      <FlatList
        data={subjects}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: sp.md }}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => load(true)} tintColor={C.accent} />}
        renderItem={({ item }) => {
          // Fall back to the embedded topics array when the API predates the
          // topic_count / weak_count fields.
          const topics     = item.topics ?? [];
          const topicCount = item.topic_count ?? topics.length;
          const weakCount  = item.weak_count ?? topics.filter(t => t.is_weak).length;

          return (
            <TouchableOpacity
              style={s.cardWrap}
              activeOpacity={0.85}
              onPress={() => openSubject(item)}
            >
              <GradientBorder radius={r.lg} width={2}>
                <View style={s.card}>
                <View style={s.cardTop}>
                  <GradientFill style={s.iconCircle}>
                    <Ionicons name={ICONS[item.icon] ?? ICONS.default} size={26} color={C.white} />
                  </GradientFill>
                  <View style={{ flex: 1 }}>
                    <Text style={s.code}>{item.code}</Text>
                    <Text style={s.name} numberOfLines={2}>{item.name}</Text>
                  </View>
                </View>

                <View style={s.stats}>
                  <View style={s.stat}>
                    <Text style={s.statNum}>{topicCount}</Text>
                    <Text style={s.statLbl}>TOPICS</Text>
                  </View>
                  <View style={s.stat}>
                    <Text style={s.statNum}>{item.question_count}</Text>
                    <Text style={s.statLbl}>QUESTIONS</Text>
                  </View>
                  <View style={s.stat}>
                    <Text style={[s.statNum, { color: C.danger }]}>{weakCount}</Text>
                    <Text style={s.statLbl}>WEAK TOPICS</Text>
                  </View>
                </View>

                <GradientButton
                  colors={grad.brand}
                  radius={r.md}
                  contentStyle={s.reviewBtn}
                  onPress={() => openSubject(item)}
                >
                  <Text style={s.reviewBtnText}>Review Subject</Text>
                  <Ionicons name="arrow-forward" size={14} color={C.white} />
                </GradientButton>
              </View>
              </GradientBorder>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="book-outline" size={38} color="#e5d5d5" />
            <Text style={s.emptyText}>No subjects available yet.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },

  cardWrap: {
    borderRadius: r.lg,
    marginBottom: sp.md,
  },
  card:    { backgroundColor: '#ffffff', borderRadius: r.lg - 2, padding: sp.md, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: sp.md },

  iconCircle: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  code:       { fontSize: 18, fontFamily: font.extraBold, color: C.text },
  name:       { fontSize: 12, fontFamily: font.regular, color: C.muted, marginTop: 2, lineHeight: 17 },

  stats: {
    flexDirection: 'row',
    paddingVertical: sp.md,
    marginTop: sp.md,
    marginBottom: sp.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.border,
  },
  stat:    { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 20, fontFamily: font.bold, color: C.text },
  statLbl: { fontSize: 10, fontFamily: font.medium, color: C.light, letterSpacing: 0.4, marginTop: 3 },

  reviewBtn: { paddingVertical: 12 },
  reviewBtnText: { fontSize: 13, fontFamily: font.semiBold, color: C.white },

  empty:     { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontFamily: font.regular, color: C.muted, fontSize: 14 },
});
