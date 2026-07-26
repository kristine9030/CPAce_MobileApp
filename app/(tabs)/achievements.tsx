import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C, sp, r, sh, font } from '@/constants/cpace-theme';
import { ScreenHeader } from '@/components/ui/screen-header';
import client from '@/lib/api/client';

interface AchievementData {
  key: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  unlocked: boolean;
  progress: number;
  current: number;
  max: number;
  earned_at: string | null;
}

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'milestone', label: 'Milestone' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'performance', label: 'Performance' },
];

const ICON_MAP: Record<string, string> = {
  flash: 'flash',
  flame: 'flame',
  star: 'star',
  trophy: 'trophy',
  book: 'book',
  bolt: 'bolt',
  bullseye: 'bullseye',
  'help-buoy': 'help-buoy',
  'document-text': 'document-text',
  clock: 'clock',
  school: 'school',
  layers: 'layers',
  'trending-up': 'trending-up',
};

export default function AchievementsScreen() {
  const router = useRouter();
  const [data, setData] = useState<AchievementData[]>([]);
  const [summary, setSummary] = useState({ unlocked: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState('all');

  useEffect(() => {
    (async () => {
      try {
        const res = await client.get('/achievements');
        setData(res.data.achievements);
        setSummary(res.data.summary);
      } catch { } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = activeCat === 'all' ? data : data.filter((a) => a.category === activeCat);
  const unlocked = data.filter((a) => a.unlocked).length;

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <ScreenHeader title="Achievements" onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title="Achievements" onBack={() => router.back()} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: sp.xl }}>
        {/* Summary */}
        <View style={s.summaryWrap}>
          <View style={s.summary}>
            <View style={s.summaryCircle}>
              <Text style={s.summaryBig}>{unlocked}</Text>
              <Text style={s.summaryOf}>/ {summary.total}</Text>
            </View>
            <View style={{ marginLeft: sp.lg, flex: 1 }}>
              <Text style={s.summaryTitle}>Unlocked</Text>
              <Text style={s.summarySub}>{summary.total - unlocked} more to go</Text>
              <View style={s.progressBg}>
                <View style={[s.progressFill, { width: `${(unlocked / summary.total) * 100}%` }]} />
              </View>
            </View>
          </View>
        </View>

        {/* Category filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catRow}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.key}
              style={[s.catBtn, activeCat === cat.key && s.catBtnActive]}
              onPress={() => setActiveCat(cat.key)}
            >
              <Text style={[s.catLabel, activeCat === cat.key && s.catLabelActive]}>{cat.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Achievements grid */}
        <View style={s.grid}>
          {filtered.map((item) => {
            const iconName = ICON_MAP[item.icon] || 'trophy';
            return (
              <View key={item.key} style={[s.cardWrap, !item.unlocked && s.cardLocked]}>
                <View style={s.card}>
                  <View style={[s.iconCircle, { backgroundColor: item.unlocked ? item.color + '20' : C.border }]}>
                    <Ionicons name={iconName as any} size={26} color={item.unlocked ? item.color : C.light} />
                  </View>
                  <Text style={[s.achTitle, !item.unlocked && s.lockedText]} numberOfLines={1}>{item.title}</Text>
                  <Text style={s.achDesc} numberOfLines={2}>{item.description}</Text>
                  {item.unlocked ? (
                    <View style={s.earnedBadge}>
                      <Ionicons name="checkmark-circle" size={12} color={C.success} />
                      <Text style={s.earnedText}>
                        {item.earned_at ? new Date(item.earned_at).toLocaleDateString() : 'Earned'}
                      </Text>
                    </View>
                  ) : (
                    <View style={s.progressBar}>
                      <View style={s.progressTrack}>
                        <View style={[s.progressFillBar, { width: `${Math.min(100, item.progress)}%` }]} />
                      </View>
                      <Text style={s.progressPct}>{item.progress}%</Text>
                    </View>
                  )}
                  {!item.unlocked && (
                    <View style={s.lockBadge}>
                      <Ionicons name="lock-closed" size={12} color={C.light} />
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  summaryWrap: { borderRadius: r.lg, marginHorizontal: sp.md, marginBottom: sp.sm, overflow: 'hidden' },
  summary: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.lg, padding: sp.md, overflow: 'hidden' },
  summaryCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', flexDirection: 'row' },
  summaryBig: { fontSize: 28, fontFamily: font.extraBold, color: C.white },
  summaryOf: { fontSize: 14, fontFamily: font.medium, color: 'rgba(255,255,255,0.7)', alignSelf: 'flex-end', marginBottom: 4 },
  summaryTitle: { fontSize: 17, fontFamily: font.bold, color: C.text },
  summarySub: { fontSize: 13, fontFamily: font.regular, color: C.muted, marginTop: 2 },
  progressBg: { height: 6, backgroundColor: C.border, borderRadius: 3, marginTop: sp.sm, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: C.accent, borderRadius: 3 },
  catRow: { paddingHorizontal: sp.md, paddingVertical: sp.sm, gap: sp.xs },
  catBtn: { paddingHorizontal: sp.md, paddingVertical: sp.xs, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.6)', marginRight: sp.xs },
  catBtnActive: { backgroundColor: C.primary },
  catLabel: { fontSize: 13, fontFamily: font.semiBold, color: C.muted },
  catLabelActive: { color: C.white },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: sp.md, gap: sp.sm },
  cardWrap: { width: '48%', borderRadius: r.lg, overflow: 'hidden' },
  cardLocked: { opacity: 0.6 },
  card: { backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.lg, padding: sp.md, alignItems: 'center', overflow: 'hidden', position: 'relative' },
  iconCircle: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', marginBottom: sp.sm },
  achTitle: { fontSize: 13, fontFamily: font.bold, color: C.text, textAlign: 'center' },
  lockedText: { color: C.muted },
  achDesc: { fontSize: 11, fontFamily: font.regular, color: C.muted, textAlign: 'center', marginTop: sp.xs, minHeight: 30 },
  earnedBadge: { flexDirection: 'row', alignItems: 'center', marginTop: sp.xs, gap: 4 },
  earnedText: { fontSize: 10, fontFamily: font.semiBold, color: C.success },
  progressBar: { flexDirection: 'row', alignItems: 'center', marginTop: sp.xs, gap: 4, width: '100%' },
  progressTrack: { flex: 1, height: 4, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden' },
  progressFillBar: { height: 4, backgroundColor: C.accent, borderRadius: 2 },
  progressPct: { fontSize: 10, fontFamily: font.bold, color: C.muted, minWidth: 28, textAlign: 'right' },
  lockBadge: { position: 'absolute', top: sp.sm, right: sp.sm },
});
