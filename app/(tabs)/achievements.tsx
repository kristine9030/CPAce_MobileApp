import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/context/auth-context';
import { C, sp, r, sh } from '@/constants/cpace-theme';

// Achievements are computed from auth user data (no dedicated API endpoint).
// They display based on the user's streak, points, and total stats.

interface Achievement {
  id: string;
  icon: string;
  title: string;
  description: string;
  unlocked: boolean;
  color: string;
}

function buildAchievements(streak: number, points: number): Achievement[] {
  return [
    {
      id: 'first_quiz',
      icon: 'flash',
      title: 'First Quiz',
      description: 'Complete your first quiz.',
      unlocked: points > 0,
      color: C.accent,
    },
    {
      id: 'streak_3',
      icon: 'flame',
      title: '3-Day Streak',
      description: 'Study 3 days in a row.',
      unlocked: streak >= 3,
      color: C.warning,
    },
    {
      id: 'streak_7',
      icon: 'flame',
      title: 'Week Warrior',
      description: 'Study 7 days in a row.',
      unlocked: streak >= 7,
      color: C.warning,
    },
    {
      id: 'streak_30',
      icon: 'flame',
      title: 'Monthly Champion',
      description: 'Study 30 days in a row.',
      unlocked: streak >= 30,
      color: C.danger,
    },
    {
      id: 'points_100',
      icon: 'star',
      title: '100 Points',
      description: 'Earn 100 total points.',
      unlocked: points >= 100,
      color: C.purple,
    },
    {
      id: 'points_500',
      icon: 'star',
      title: '500 Points',
      description: 'Earn 500 total points.',
      unlocked: points >= 500,
      color: C.purple,
    },
    {
      id: 'points_1000',
      icon: 'trophy',
      title: 'Point Millionaire',
      description: 'Earn 1,000 total points.',
      unlocked: points >= 1000,
      color: C.success,
    },
    {
      id: 'points_5000',
      icon: 'trophy',
      title: 'CPACE Legend',
      description: 'Earn 5,000 total points.',
      unlocked: points >= 5000,
      color: C.success,
    },
  ];
}

export default function AchievementsScreen() {
  const router        = useRouter();
  const { user }      = useAuth();
  const achievements  = buildAchievements(user?.streak_days ?? 0, user?.total_points ?? 0);
  const unlocked      = achievements.filter(a => a.unlocked).length;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 40 }}>
          <Ionicons name="arrow-back" size={24} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Achievements</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Summary */}
      <View style={s.summary}>
        <View style={s.summaryCircle}>
          <Text style={s.summaryBig}>{unlocked}</Text>
          <Text style={s.summaryOf}>/ {achievements.length}</Text>
        </View>
        <View style={{ marginLeft: sp.lg }}>
          <Text style={s.summaryTitle}>Unlocked</Text>
          <Text style={s.summarySub}>{achievements.length - unlocked} more to go</Text>
          <View style={s.progressBg}>
            <View style={[s.progressFill, { width: `${(unlocked / achievements.length) * 100}%` }]} />
          </View>
        </View>
      </View>

      <FlatList
        data={achievements}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: sp.md }}
        numColumns={2}
        columnWrapperStyle={{ gap: sp.sm }}
        renderItem={({ item }) => (
          <View style={[s.card, sh.sm, !item.unlocked && s.cardLocked]}>
            <View style={[s.iconCircle, { backgroundColor: item.unlocked ? item.color + '20' : C.border }]}>
              <Ionicons name={item.icon as any} size={28} color={item.unlocked ? item.color : C.light} />
            </View>
            <Text style={[s.achTitle, !item.unlocked && s.lockedText]}>{item.title}</Text>
            <Text style={s.achDesc} numberOfLines={2}>{item.description}</Text>
            {!item.unlocked && (
              <View style={s.lockBadge}>
                <Ionicons name="lock-closed" size={12} color={C.light} />
              </View>
            )}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.bg },
  header:        { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: sp.lg, paddingVertical: sp.md },
  headerTitle:   { flex: 1, fontSize: 18, fontWeight: '700', color: C.white, textAlign: 'center' },
  summary:       { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primary, paddingHorizontal: sp.lg, paddingBottom: sp.lg },
  summaryCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', flexDirection: 'row' },
  summaryBig:    { fontSize: 28, fontWeight: '900', color: C.white },
  summaryOf:     { fontSize: 14, color: 'rgba(255,255,255,0.6)', alignSelf: 'flex-end', marginBottom: 4 },
  summaryTitle:  { fontSize: 18, fontWeight: '700', color: C.white },
  summarySub:    { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  progressBg:    { width: 160, height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, marginTop: sp.sm, overflow: 'hidden' },
  progressFill:  { height: 6, backgroundColor: C.accent, borderRadius: 3 },
  card:          { flex: 1, backgroundColor: C.card, borderRadius: r.lg, padding: sp.md, alignItems: 'center', marginBottom: sp.sm, position: 'relative' },
  cardLocked:    { opacity: 0.6 },
  iconCircle:    { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginBottom: sp.sm },
  achTitle:      { fontSize: 13, fontWeight: '700', color: C.text, textAlign: 'center' },
  lockedText:    { color: C.muted },
  achDesc:       { fontSize: 11, color: C.muted, textAlign: 'center', marginTop: sp.xs },
  lockBadge:     { position: 'absolute', top: sp.sm, right: sp.sm },
});
