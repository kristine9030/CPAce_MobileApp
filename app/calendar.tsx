import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client from '@/lib/api/client';
import { C, sp, r, sh } from '@/constants/cpace-theme';

interface CalendarData {
  year: number;
  month: number;
  month_name: string;
  days: Array<{
    date: string;
    day: number;
    has_review: boolean;
    review_count: number;
    is_today: boolean;
    is_past: boolean;
    events?: Array<{ id: number; topic: string; subject_code: string; count: number }>;
  }>;
  today_reviews: Array<{ id: number; topic: string; subject_code: string; due_at: string }>;
  upcoming: Array<{ date: string; topic: string; subject_code: string }>;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarScreen() {
  const router                = useRouter();
  const [data, setData]       = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [year, setYear]       = useState(new Date().getFullYear());
  const [month, setMonth]     = useState(new Date().getMonth() + 1);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async (y: number, m: number, isRefresh = false) => {
    if (isRefresh) setRefresh(true);
    try {
      const res = await client.get('/calendar', { params: { year: y, month: m } });
      setData(res.data);
    } catch {}
    setLoading(false);
    setRefresh(false);
  }, []);

  useFocusEffect(useCallback(() => { load(year, month); }, [year, month]));

  const prevMonth = () => {
    const nm = month === 1 ? 12 : month - 1;
    const ny = month === 1 ? year - 1 : year;
    setMonth(nm); setYear(ny); setSelected(null);
  };

  const nextMonth = () => {
    const nm = month === 12 ? 1 : month + 1;
    const ny = month === 12 ? year + 1 : year;
    setMonth(nm); setYear(ny); setSelected(null);
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={C.accent} /></View>;
  }

  const d = data!;
  // Build grid with leading blanks
  const firstDay = d.days[0] ? new Date(d.days[0].date).getDay() : 0;
  const blanks   = Array(firstDay).fill(null);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 40 }}>
          <Ionicons name="arrow-back" size={24} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Study Calendar</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: sp.xl }}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => load(year, month, true)} tintColor={C.accent} />}
      >
        {/* Month Nav */}
        <View style={[s.card, sh.sm]}>
          <View style={s.monthNav}>
            <TouchableOpacity onPress={prevMonth} style={s.navArrow}>
              <Ionicons name="chevron-back" size={22} color={C.text} />
            </TouchableOpacity>
            <Text style={s.monthLabel}>{d.month_name} {d.year}</Text>
            <TouchableOpacity onPress={nextMonth} style={s.navArrow}>
              <Ionicons name="chevron-forward" size={22} color={C.text} />
            </TouchableOpacity>
          </View>

          {/* Weekday Headers */}
          <View style={s.weekRow}>
            {WEEKDAYS.map(w => (
              <Text key={w} style={s.weekDay}>{w}</Text>
            ))}
          </View>

          {/* Day Grid */}
          <View style={s.grid}>
            {blanks.map((_, i) => <View key={`b${i}`} style={s.dayCell} />)}
            {d.days.map((day) => {
              const isSelected = selected === day.date;
              return (
                <TouchableOpacity
                  key={day.date}
                  style={[s.dayCell, day.is_today && s.todayCell, isSelected && !day.is_today && s.selectedCell]}
                  onPress={() => setSelected(isSelected ? null : day.date)}
                >
                  <Text style={[s.dayNum, day.is_today && s.todayNum, day.is_past && !day.is_today && s.pastNum, isSelected && !day.is_today && s.selectedNum]}>
                    {day.day}
                  </Text>
                  {day.has_review && (
                    <View style={[s.dot, { backgroundColor: day.is_today ? C.white : C.accent }]} />
                  )}
                  {day.review_count > 1 && (
                    <Text style={[s.dotCount, day.is_today && { color: C.white }]}>{day.review_count}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={s.legend}>
            <View style={s.legendItem}>
              <View style={[s.dot, { backgroundColor: C.accent }]} />
              <Text style={s.legendText}>Spaced review due</Text>
            </View>
          </View>
        </View>

        {/* Selected Day's Reviews */}
        {selected && (() => {
          const day = d.days.find(x => x.date === selected);
          const events = day?.events ?? [];
          return (
            <View style={[s.card, sh.sm]}>
              <View style={s.selectedHeader}>
                <Text style={s.sectionTitle}>Reviews on {fmtDateLong(selected)}</Text>
                <TouchableOpacity onPress={() => setSelected(null)}>
                  <Ionicons name="close-circle" size={20} color={C.muted} />
                </TouchableOpacity>
              </View>
              {events.length === 0 ? (
                <Text style={s.emptyDayText}>No reviews scheduled on this day.</Text>
              ) : (
                events.map((item) => (
                  <View key={item.id} style={s.reviewRow}>
                    <View style={s.reviewDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.reviewTopic}>{item.topic}</Text>
                      <Text style={s.reviewSub}>{item.subject_code} · {item.count} question{item.count > 1 ? 's' : ''}</Text>
                    </View>
                    <TouchableOpacity
                      style={s.reviewBtn}
                      onPress={() => router.push({ pathname: '/(tabs)/quizzes', params: { subjectCode: item.subject_code ?? '' } })}
                    >
                      <Text style={s.reviewBtnText}>Study</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          );
        })()}

        {/* Today's Reviews */}
        {d.today_reviews?.length > 0 && (
          <View style={[s.card, sh.sm]}>
            <Text style={s.sectionTitle}>Today's Reviews</Text>
            {d.today_reviews.map((item) => (
              <View key={item.id} style={s.reviewRow}>
                <View style={s.reviewDot} />
                <View style={{ flex: 1 }}>
                  <Text style={s.reviewTopic}>{item.topic}</Text>
                  <Text style={s.reviewSub}>{item.subject_code}</Text>
                </View>
                <TouchableOpacity
                  style={s.reviewBtn}
                  onPress={() => router.push({ pathname: '/(tabs)/quizzes', params: { subjectCode: item.subject_code ?? '' } })}
                >
                  <Text style={s.reviewBtnText}>Study</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Upcoming */}
        {d.upcoming?.length > 0 && (
          <View style={[s.card, sh.sm]}>
            <Text style={s.sectionTitle}>Upcoming Reviews</Text>
            {d.upcoming.map((item, i) => (
              <View key={i} style={s.upRow}>
                <Text style={s.upDate}>{fmtDate(item.date)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.upTopic}>{item.topic}</Text>
                  <Text style={s.upSub}>{item.subject_code}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {!d.today_reviews?.length && !d.upcoming?.length && (
          <View style={[s.card, sh.sm, { alignItems: 'center', paddingVertical: sp.xl }]}>
            <Ionicons name="calendar-outline" size={48} color={C.light} />
            <Text style={s.emptyText}>No spaced reviews scheduled.</Text>
            <Text style={[s.emptyText, { fontSize: 12, marginTop: sp.xs }]}>Complete quizzes to build your review schedule.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function fmtDate(str: string) {
  return new Date(str).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function fmtDateLong(str: string) {
  return new Date(str).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: C.bg },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  header:       { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: sp.lg, paddingVertical: sp.md },
  headerTitle:  { flex: 1, fontSize: 18, fontWeight: '700', color: C.white, textAlign: 'center' },
  card:         { backgroundColor: C.card, borderRadius: r.lg, padding: sp.md, margin: sp.md, marginBottom: 0 },
  monthNav:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: sp.md },
  navArrow:     { padding: sp.xs },
  monthLabel:   { fontSize: 17, fontWeight: '700', color: C.text },
  weekRow:      { flexDirection: 'row', marginBottom: sp.xs },
  weekDay:      { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: C.muted },
  grid:         { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell:      { width: `${100 / 7}%`, aspectRatio: 1, justifyContent: 'center', alignItems: 'center' },
  todayCell:    { backgroundColor: C.accent, borderRadius: r.full },
  selectedCell: { borderWidth: 2, borderColor: C.accent, borderRadius: r.full },
  selectedNum:  { color: C.accent, fontWeight: '800' },
  selectedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  emptyDayText: { fontSize: 13, color: C.muted, paddingVertical: sp.xs },
  dayNum:       { fontSize: 14, fontWeight: '500', color: C.text },
  todayNum:     { color: C.white, fontWeight: '800' },
  pastNum:      { color: C.light },
  dot:          { width: 5, height: 5, borderRadius: 3, backgroundColor: C.accent, marginTop: 2 },
  dotCount:     { fontSize: 9, color: C.accent, fontWeight: '700' },
  legend:       { flexDirection: 'row', gap: sp.md, marginTop: sp.sm, paddingTop: sp.sm, borderTopWidth: 1, borderTopColor: C.border },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: sp.xs },
  legendText:   { fontSize: 12, color: C.muted },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: sp.sm },
  reviewRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: sp.xs, borderBottomWidth: 1, borderBottomColor: C.border },
  reviewDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent, marginRight: sp.sm },
  reviewTopic:  { fontSize: 14, fontWeight: '600', color: C.text },
  reviewSub:    { fontSize: 12, color: C.muted },
  reviewBtn:    { backgroundColor: C.accent + '20', paddingHorizontal: sp.sm, paddingVertical: 4, borderRadius: r.sm },
  reviewBtnText:{ fontSize: 12, fontWeight: '700', color: C.accent },
  upRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: sp.xs, borderBottomWidth: 1, borderBottomColor: C.border },
  upDate:       { width: 60, fontSize: 12, fontWeight: '700', color: C.accent },
  upTopic:      { fontSize: 14, fontWeight: '600', color: C.text },
  upSub:        { fontSize: 12, color: C.muted },
  emptyText:    { fontSize: 14, color: C.muted, marginTop: sp.sm, textAlign: 'center' },
});
