import { useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, Pressable, Dimensions, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client from '@/lib/api/client';
import { C, sp, r, font } from '@/constants/cpace-theme';
import { GradientButton, GradientFill } from '@/components/ui/gradient';

/* ── API shapes ─────────────────────────────────────────────────────────────*/
interface DayInfo {
  date: string;
  day: number;
  has_review: boolean;
  review_count: number;
  is_today: boolean;
  is_past: boolean;
  events?: { id: number; topic: string; subject_code: string; count: number; priority?: string; is_weak?: boolean }[];
}

interface StudyEvent {
  id: number;
  title: string;
  subject_code: string | null;
  date: string;
  start_hour: number;
  duration_hours: number;
}

interface CalendarData {
  year: number;
  month: number;
  month_name: string;
  days: DayInfo[];
  custom_events?: StudyEvent[];
  today_reviews: { id: number; topic: string; subject_code: string; due_at: string; priority?: string; is_weak?: boolean }[];
  upcoming: { date: string; topic: string; subject_code: string; priority?: string; is_weak?: boolean }[];
}

interface TopicLite   { id: number; name: string; question_count?: number }
interface SubjectLite { id: number; code: string; name: string; topics?: TopicLite[] }

/* ── Grid geometry ──────────────────────────────────────────────────────────*/
const SW         = Dimensions.get('window').width;
const GUTTER_W   = 46;
const HOUR_H     = 56;
const START_HOUR = 6;                        // first row drawn (6 AM)
const END_HOUR   = 22;                       // last row drawn (10 PM)
const HOURS      = END_HOUR - START_HOUR;
const COL_W      = (SW - GUTTER_W) / 7;
const FIRST_SLOT = 9;                        // reviews are laid out from 9 AM
const MAX_BLOCKS = END_HOUR - FIRST_SLOT;
const HOUR_CHOICES = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

const DOW      = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const FULL_DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* Event colours — one per subject, light fill + saturated left bar. */
const EVENT_COLORS = [
  { bg: '#FCF3D2', bar: '#D9A521', text: '#6B4E0B' },
  { bg: '#FBE0DC', bar: '#C0392B', text: '#7B1416' },
  { bg: '#E2E7FA', bar: '#4C63B6', text: '#26325E' },
  { bg: '#DFF3E7', bar: '#21A366', text: '#12603B' },
  { bg: '#ECE0FA', bar: '#8E5BD0', text: '#4A2A73' },
  { bg: '#FBE2EE', bar: '#C2417A', text: '#6E2145' },
  { bg: '#F3E7DA', bar: '#9A6B3F', text: '#5A3B1E' },
] as const;

function colorFor(code: string) {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return EVENT_COLORS[h % EVENT_COLORS.length];
}

/* ── Date helpers (local time — never parse 'YYYY-MM-DD' with `new Date`) ───*/
const pad         = (n: number) => String(n).padStart(2, '0');
const iso         = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays     = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths   = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const startOfDay  = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const startOfWeek = (d: Date) => addDays(startOfDay(d), -d.getDay());
const monthKey    = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}`;
const sameDay     = (a: Date, b: Date) => iso(a) === iso(b);
const parseISO    = (v: string) => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); };

interface Block {
  key: string;
  title: string;
  code: string;
  count: number;        // questions due (reviews only)
  start: number;        // hour, 24h
  end: number;
  custom: boolean;
  eventId?: number;     // custom events only — needed to delete
  is_weak?: boolean;    // flagged as a weak topic — same rule the Performance page uses
  lane?: number;
  lanes?: number;
}

export default function CalendarScreen() {
  const router = useRouter();

  const [months, setMonths]     = useState<Record<string, CalendarData>>({});
  const [subjects, setSubjects] = useState<SubjectLite[]>([]);
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [weekStart, setWeek]    = useState(() => startOfWeek(new Date()));
  const [view, setView]         = useState<'week' | 'month'>('week');
  const [loading, setLoading]   = useState(true);
  const [refresh, setRefresh]   = useState(false);

  const [detail, setDetail]   = useState<(Block & { date: Date }) | null>(null);
  const [dayOpen, setDayOpen] = useState(false);
  const [form, setForm]       = useState<null | {
    subjectId: number | null; topic: string | null;
    date: Date; start: number; duration: number;
  }>(null);
  const [topicOpen, setTopicOpen] = useState(false);
  const [saving, setSaving]       = useState(false);

  // Mirror of `months` so `load` can check the cache without re-creating itself.
  const monthsRef = useRef(months);
  monthsRef.current = months;

  const gridRef   = useRef<ScrollView>(null);
  const didScroll = useRef(false);

  const load = useCallback(async (dates: Date[], force = false) => {
    const keys = [...new Set(dates.map(monthKey))];
    const missing = keys.filter(k => force || !monthsRef.current[k]);
    if (!missing.length) { setLoading(false); return; }
    if (force) setRefresh(true);
    try {
      const results = await Promise.all(missing.map(async (k) => {
        const [y, m] = k.split('-').map(Number);
        const res = await client.get('/calendar', { params: { year: y, month: m } });
        return [k, res.data as CalendarData] as const;
      }));
      setMonths(prev => ({ ...prev, ...Object.fromEntries(results) }));
    } catch {}
    setLoading(false);
    setRefresh(false);
  }, []);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  useFocusEffect(useCallback(() => {
    load([weekStart, addDays(weekStart, 6), selected]);
  }, [load, weekStart, selected]));

  const anchor    = months[monthKey(selected)];
  const monthName = anchor?.month_name
    ?? selected.toLocaleDateString('en-PH', { month: 'long' });

  const reloadVisible = () => load([weekStart, addDays(weekStart, 6), selected], true);

  const dayFor = (d: Date) => months[monthKey(d)]?.days.find(x => x.date === iso(d));

  /* The SM-2 schedule stores a review *date*, not a time of day, so reviews are
     laid out as consecutive one-hour blocks from 9 AM (busiest topic first).
     Student-added study blocks keep the exact hour they were saved with. */
  const blocksFor = (d: Date): Block[] => {
    const md  = months[monthKey(d)];
    const day = dayFor(d);
    const out: Block[] = [];

    if (day?.has_review) {
      let events = day.events ?? [];
      if (!events.length) {
        // Older/offline payloads report only a per-day count — name what we can.
        const named = day.is_today
          ? (md?.today_reviews ?? [])
          : (md?.upcoming ?? []).filter(u => u.date === day.date);
        const n = Math.max(1, Math.min(day.review_count, 3));
        events = Array.from({ length: n }, (_, i) => ({
          id: i,
          topic: named[i]?.topic ?? 'Spaced review',
          subject_code: named[i]?.subject_code ?? '',
          count: Math.max(1, Math.round(day.review_count / n)),
          is_weak: named[i]?.is_weak,
        }));
      }
      events.slice(0, MAX_BLOCKS).forEach((e, i) => out.push({
        key: `r${day.date}-${e.id}-${i}`,
        title: e.topic,
        code: e.subject_code,
        count: e.count,
        start: FIRST_SLOT + i,
        end: FIRST_SLOT + i + 1,
        custom: false,
        is_weak: e.is_weak,
      }));
    }

    (md?.custom_events ?? []).filter(e => e.date === iso(d)).forEach((e) => out.push({
      key: `c${e.id}`,
      title: e.title,
      code: e.subject_code ?? '',
      count: 0,
      start: e.start_hour,
      end: Math.min(END_HOUR, e.start_hour + e.duration_hours),
      custom: true,
      eventId: e.id,
    }));

    return packLanes(out);
  };

  /* Jump to today: select it, move the week/month onto it, and scroll the grid
     back to the current hour so the tap always does something visible. */
  const goToday = () => {
    const now = new Date();
    setSelected(startOfDay(now));
    setWeek(startOfWeek(now));
    const target = Math.max(0, (Math.min(now.getHours(), END_HOUR - 1) - 1 - START_HOUR) * HOUR_H);
    requestAnimationFrame(() => gridRef.current?.scrollTo({ y: target, animated: true }));
  };

  const shift = (n: number) => {
    if (view === 'week') {
      const ws = addDays(weekStart, n * 7);
      setWeek(ws);
      setSelected(addDays(ws, selected.getDay()));
    } else {
      const m = addMonths(selected, n);
      setSelected(m);
      setWeek(startOfWeek(m));
    }
  };

  const openForm = (date: Date) => {
    setDayOpen(false);
    setTopicOpen(false);
    setForm({ subjectId: null, topic: null, date, start: 9, duration: 1 });
    if (!subjects.length) {
      client.get('/subjects')
        .then(res => setSubjects(res.data.subjects ?? res.data ?? []))
        .catch(() => {});
    }
  };

  const formSubject = subjects.find(x => x.id === form?.subjectId) ?? null;
  const formTopics  = formSubject?.topics ?? [];

  const saveEvent = async () => {
    if (!form) return;
    if (!formSubject)  { Alert.alert('Required', 'Please choose a subject.'); return; }
    if (!form.topic)   { Alert.alert('Required', 'Please choose a topic.'); return; }
    setSaving(true);
    try {
      await client.post('/calendar/events', {
        title: form.topic,
        subject_code: formSubject.code,
        date: iso(form.date),
        start_hour: form.start,
        duration_hours: form.duration,
      });
      setForm(null);
      await load([form.date], true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not save this study block.');
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = (block: Block & { date: Date }) => {
    Alert.alert('Delete study block', `Remove "${block.title}" from your calendar?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await client.delete(`/calendar/events/${block.eventId}`);
          setDetail(null);
          await load([block.date], true);
        } catch (err: any) {
          Alert.alert('Error', err.message || 'Could not delete this study block.');
        }
      }},
    ]);
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={C.accent} /></View>;
  }

  const now        = new Date();
  const onToday    = sameDay(selected, now);
  const showNowBar = weekDays.some(d => sameDay(d, now))
    && now.getHours() >= START_HOUR && now.getHours() < END_HOUR;
  const nowTop     = (now.getHours() + now.getMinutes() / 60 - START_HOUR) * HOUR_H;
  const dayBlocks  = blocksFor(selected);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>

      {/* ── Top bar ── */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={s.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => shift(-1)} hitSlop={6} style={s.iconBtn}>
          <Ionicons name="chevron-back" size={20} color={C.muted} />
        </TouchableOpacity>
        <Text style={s.monthTitle}>{monthName} {selected.getFullYear()}</Text>
        <TouchableOpacity onPress={() => shift(1)} hitSlop={6} style={s.iconBtn}>
          <Ionicons name="chevron-forward" size={20} color={C.muted} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={goToday} hitSlop={10} style={s.todayBtn} activeOpacity={0.6}>
          <Ionicons
            name="calendar-clear-outline"
            size={26}
            color={onToday ? C.light : C.accent}
          />
          <Text style={[s.todayNum, { color: onToday ? C.light : C.accent }]}>
            {new Date().getDate()}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── View switch ── */}
      <View style={s.switchRow}>
        {(['week', 'month'] as const).map((v) => (
          v === view ? (
            <GradientButton
              key={v}
              radius={r.full}
              contentStyle={s.switchBtn}
              onPress={() => setView(v)}
            >
              <Text style={[s.switchText, { color: C.white }]}>{v === 'week' ? 'Week' : 'Month'}</Text>
            </GradientButton>
          ) : (
            <TouchableOpacity key={v} style={[s.switchBtn, s.switchOff]} onPress={() => setView(v)}>
              <Text style={s.switchText}>{v === 'week' ? 'Week' : 'Month'}</Text>
            </TouchableOpacity>
          )
        ))}
      </View>

      {view === 'week' ? (
        <>
          {/* ── Week strip ── */}
          <View style={s.strip}>
            {weekDays.map((d) => {
              const isSel   = sameDay(d, selected);
              const isToday = sameDay(d, now);
              const info    = dayFor(d);
              const hasCustom = (months[monthKey(d)]?.custom_events ?? []).some(e => e.date === iso(d));
              return (
                <TouchableOpacity
                  key={iso(d)}
                  style={s.stripCell}
                  activeOpacity={0.7}
                  onPress={() => setSelected(d)}
                >
                  <Text style={[s.stripDow, isSel && { color: C.accent }]}>{DOW[d.getDay()]}</Text>
                  {isSel ? (
                    <GradientFill style={s.stripPill}>
                      <Text style={[s.stripNum, { color: C.white }]}>{d.getDate()}</Text>
                    </GradientFill>
                  ) : (
                    <View style={s.stripPill}>
                      <Text style={[
                        s.stripNum,
                        isToday && { color: C.accent, fontFamily: font.extraBold },
                        d.getMonth() !== selected.getMonth() && !isToday && { color: C.light },
                      ]}>
                        {d.getDate()}
                      </Text>
                    </View>
                  )}
                  <View style={[s.stripDot, (info?.has_review || hasCustom) ? { backgroundColor: C.accent } : null]} />
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Time grid ── */}
          <ScrollView
            ref={gridRef}
            contentContainerStyle={{ paddingBottom: 120 }}
            // `contentOffset` is iOS-only, so jump to the morning once on mount.
            onContentSizeChange={() => {
              if (didScroll.current) return;
              didScroll.current = true;
              gridRef.current?.scrollTo({ y: (8 - START_HOUR) * HOUR_H, animated: false });
            }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refresh} onRefresh={reloadVisible} tintColor={C.accent} />
            }
          >
            <View style={s.gridRow}>
              <View style={{ width: GUTTER_W }}>
                {Array.from({ length: HOURS }, (_, i) => (
                  <View key={i} style={s.hourCell}>
                    <Text style={s.hourText}>{fmtHour(START_HOUR + i)}</Text>
                  </View>
                ))}
              </View>

              {weekDays.map((d) => {
                const isSel = sameDay(d, selected);
                return (
                  <View key={iso(d)} style={[s.col, isSel && s.colSelected]}>
                    {Array.from({ length: HOURS }, (_, i) => (
                      <View key={i} style={s.hourSlot} />
                    ))}

                    {blocksFor(d).map((b) => {
                      const col   = colorFor(b.code || b.title);
                      const lanes = b.lanes ?? 1;
                      const w     = (COL_W - 4) / lanes;
                      return (
                        <TouchableOpacity
                          key={b.key}
                          activeOpacity={0.8}
                          onPress={() => setDetail({ ...b, date: d })}
                          style={[
                            s.event,
                            {
                              top: (b.start - START_HOUR) * HOUR_H + 1,
                              height: (b.end - b.start) * HOUR_H - 3,
                              left: 2 + (b.lane ?? 0) * w,
                              width: w - 1,
                              backgroundColor: col.bg,
                            },
                          ]}
                        >
                          <View style={[s.eventBar, { backgroundColor: col.bar }]} />
                          <View style={s.eventBody}>
                            {!!b.code && (
                              <Text style={[s.eventCode, { color: col.text }]} numberOfLines={1}>{b.code}</Text>
                            )}
                            <Text style={[s.eventTopic, { color: col.text }]} numberOfLines={2}>{b.title}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}

              {showNowBar && (
                <View pointerEvents="none" style={[s.nowLine, { top: nowTop }]}>
                  <View style={s.nowDot} />
                  <View style={s.nowBar} />
                </View>
              )}
            </View>
          </ScrollView>
        </>
      ) : (
        /* ── Month view ── */
        <ScrollView
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={
            <RefreshControl refreshing={refresh} onRefresh={reloadVisible} tintColor={C.accent} />
          }
        >
          <MonthGrid
            anchor={selected}
            data={anchor}
            selected={selected}
            today={now}
            blocksFor={blocksFor}
            onPick={(d) => { setSelected(d); setWeek(startOfWeek(d)); setDayOpen(true); }}
          />

          <View style={s.agendaBlock}>
            <View style={s.agendaHead}>
              <Text style={s.agendaTitle}>
                {FULL_DOW[selected.getDay()]}, {fmtShort(iso(selected))}
              </Text>
              <TouchableOpacity onPress={() => openForm(selected)} hitSlop={8}>
                <Text style={s.agendaAdd}>+ Add</Text>
              </TouchableOpacity>
            </View>
            {dayBlocks.length === 0 ? (
              <Text style={s.emptySub}>Nothing scheduled. Tap “+ Add” to plan a study block.</Text>
            ) : dayBlocks.map((b) => (
              <AgendaRow
                key={b.key}
                title={b.title}
                code={b.code}
                when={`${fmtHour(b.start)} – ${fmtHour(b.end)}`}
                custom={b.custom}
                isWeak={b.is_weak}
                onPress={() => setDetail({ ...b, date: selected })}
              />
            ))}
          </View>
        </ScrollView>
      )}

      {/* ── Add study block ── */}
      <TouchableOpacity
        style={s.fab}
        activeOpacity={0.85}
        onPress={() => openForm(selected)}
      >
        <GradientFill style={s.fabFill}>
          <Ionicons name="add" size={28} color={C.white} />
        </GradientFill>
      </TouchableOpacity>

      {/* ── Day sheet (month view tap) ── */}
      <Modal visible={dayOpen} transparent animationType="fade" onRequestClose={() => setDayOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setDayOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetTitle}>
              {FULL_DOW[selected.getDay()]}, {fmtShort(iso(selected))}
            </Text>
            {dayBlocks.length === 0 ? (
              <Text style={s.emptySub}>Nothing scheduled on this day.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 260 }}>
                {dayBlocks.map((b) => (
                  <AgendaRow
                    key={b.key}
                    title={b.title}
                    code={b.code}
                    when={`${fmtHour(b.start)} – ${fmtHour(b.end)}`}
                    custom={b.custom}
                    isWeak={b.is_weak}
                    onPress={() => { setDayOpen(false); setDetail({ ...b, date: selected }); }}
                  />
                ))}
              </ScrollView>
            )}
            <GradientButton
              radius={r.md}
              contentStyle={{ paddingVertical: 13 }}
              onPress={() => openForm(selected)}
            >
              <Ionicons name="add" size={16} color={C.white} />
              <Text style={s.sheetBtnText}>Add study block</Text>
            </GradientButton>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Event detail ── */}
      <Modal visible={!!detail} transparent animationType="fade" onRequestClose={() => setDetail(null)}>
        <Pressable style={s.overlay} onPress={() => setDetail(null)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            {detail && (() => {
              const col = colorFor(detail.code || detail.title);
              return (
                <>
                  <View style={s.sheetTop}>
                    <View style={[s.sheetSwatch, { backgroundColor: col.bar }]} />
                    <Text style={s.sheetTitle}>{detail.title}</Text>
                  </View>
                  <Text style={s.sheetWhen}>
                    {FULL_DOW[detail.date.getDay()]}, {fmtShort(iso(detail.date))} · {fmtHour(detail.start)} – {fmtHour(detail.end)}
                  </Text>
                  <View style={s.sheetMeta}>
                    {!!detail.code && (
                      <View style={[s.sheetChip, { backgroundColor: col.bg }]}>
                        <Text style={[s.sheetChipText, { color: col.text }]}>{detail.code}</Text>
                      </View>
                    )}
                    <Text style={s.sheetCount}>
                      {detail.custom
                        ? 'Study block you added'
                        : `${detail.count} question${detail.count === 1 ? '' : 's'} due`}
                    </Text>
                    {!detail.custom && detail.is_weak && (
                      <View style={[s.sheetChip, { backgroundColor: C.danger + '18', flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                        <Ionicons name="flame" size={12} color={C.danger} />
                        <Text style={[s.sheetChipText, { color: C.danger }]}>Weak topic</Text>
                      </View>
                    )}
                  </View>
                  <GradientButton
                    radius={r.md}
                    contentStyle={{ paddingVertical: 13 }}
                    onPress={() => {
                      const code = detail.code;
                      setDetail(null);
                      router.push({ pathname: '/(tabs)/quizzes', params: { subjectCode: code ?? '' } });
                    }}
                  >
                    <Ionicons name="play" size={16} color={C.white} />
                    <Text style={s.sheetBtnText}>Study now</Text>
                  </GradientButton>
                  {detail.custom && (
                    <TouchableOpacity style={s.deleteBtn} onPress={() => deleteEvent(detail)}>
                      <Ionicons name="trash-outline" size={16} color={C.danger} />
                      <Text style={s.deleteText}>Delete</Text>
                    </TouchableOpacity>
                  )}
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Add / edit form ── */}
      <Modal visible={!!form} transparent animationType="slide" onRequestClose={() => setForm(null)}>
          <Pressable style={s.overlay} onPress={() => setForm(null)}>
            <Pressable style={s.sheet} onPress={() => {}}>
              {form && (
                <>
                  <Text style={s.sheetTitle}>New study block</Text>

                  <Text style={s.formLabel}>Subject</Text>
                  {subjects.length === 0 ? (
                    <ActivityIndicator color={C.accent} style={{ alignSelf: 'flex-start', paddingVertical: 8 }} />
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
                      {subjects.map((sub) => {
                        const active = form.subjectId === sub.id;
                        return (
                          <TouchableOpacity
                            key={sub.id}
                            style={[s.chip, active && s.chipOn]}
                            // Topics belong to a subject, so switching subject clears it.
                            onPress={() => { setForm(f => f && ({ ...f, subjectId: sub.id, topic: null })); setTopicOpen(false); }}
                          >
                            <Text style={[s.chipText, active && s.chipTextOn]}>{sub.code}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}

                  <Text style={s.formLabel}>Topic</Text>
                  <TouchableOpacity
                    style={[s.select, !formSubject && s.selectOff]}
                    activeOpacity={0.7}
                    disabled={!formSubject}
                    onPress={() => setTopicOpen(v => !v)}
                  >
                    <Text
                      style={[s.selectText, !form.topic && { color: C.light }]}
                      numberOfLines={1}
                    >
                      {form.topic
                        ?? (formSubject ? 'Select a topic' : 'Choose a subject first')}
                    </Text>
                    <Ionicons
                      name={topicOpen ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={formSubject ? C.muted : C.light}
                    />
                  </TouchableOpacity>

                  {topicOpen && (
                    <View style={s.dropdown}>
                      {formTopics.length === 0 ? (
                        <Text style={s.dropdownEmpty}>No topics for this subject yet.</Text>
                      ) : (
                        <ScrollView style={{ maxHeight: 190 }} nestedScrollEnabled>
                          {formTopics.map((t) => {
                            const active = form.topic === t.name;
                            return (
                              <TouchableOpacity
                                key={t.id}
                                style={[s.dropdownRow, active && s.dropdownRowOn]}
                                onPress={() => { setForm(f => f && ({ ...f, topic: t.name })); setTopicOpen(false); }}
                              >
                                <Text style={[s.dropdownText, active && { color: C.primary, fontFamily: font.semiBold }]} numberOfLines={1}>
                                  {t.name}
                                </Text>
                                {typeof t.question_count === 'number' && (
                                  <Text style={s.dropdownMeta}>{t.question_count}q</Text>
                                )}
                                {active && <Ionicons name="checkmark" size={16} color={C.primary} />}
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      )}
                    </View>
                  )}

                  <Text style={s.formLabel}>Date</Text>
                  <View style={s.stepper}>
                    <TouchableOpacity
                      style={s.stepBtn}
                      onPress={() => setForm(f => f && ({ ...f, date: addDays(f.date, -1) }))}
                    >
                      <Ionicons name="chevron-back" size={18} color={C.text} />
                    </TouchableOpacity>
                    <Text style={s.stepValue}>
                      {FULL_DOW[form.date.getDay()].slice(0, 3)}, {fmtShort(iso(form.date))}
                    </Text>
                    <TouchableOpacity
                      style={s.stepBtn}
                      onPress={() => setForm(f => f && ({ ...f, date: addDays(f.date, 1) }))}
                    >
                      <Ionicons name="chevron-forward" size={18} color={C.text} />
                    </TouchableOpacity>
                  </View>

                  <Text style={s.formLabel}>Starts</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
                    {HOUR_CHOICES.map((h) => (
                      <TouchableOpacity
                        key={h}
                        style={[s.chip, form.start === h && s.chipOn]}
                        onPress={() => setForm(f => f && ({ ...f, start: h }))}
                      >
                        <Text style={[s.chipText, form.start === h && s.chipTextOn]}>{fmtHour(h)}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <Text style={s.formLabel}>Duration</Text>
                  <View style={s.chipRow}>
                    {[1, 2, 3].map((h) => (
                      <TouchableOpacity
                        key={h}
                        style={[s.chip, form.duration === h && s.chipOn]}
                        onPress={() => setForm(f => f && ({ ...f, duration: h }))}
                      >
                        <Text style={[s.chipText, form.duration === h && s.chipTextOn]}>{h} hr</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={s.formActions}>
                    <TouchableOpacity style={s.cancelBtn} onPress={() => setForm(null)}>
                      <Text style={s.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <GradientButton
                      radius={r.md}
                      style={{ flex: 1 }}
                      contentStyle={{ paddingVertical: 13 }}
                      onPress={saveEvent}
                      loading={saving}
                    >
                      <Ionicons name="checkmark" size={16} color={C.white} />
                      <Text style={s.sheetBtnText}>Save</Text>
                    </GradientButton>
                  </View>
                </>
              )}
            </Pressable>
          </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

/* ── Month grid ─────────────────────────────────────────────────────────────*/
function MonthGrid({ anchor, data, selected, today, blocksFor, onPick }: {
  anchor: Date;
  data?: CalendarData;
  selected: Date;
  today: Date;
  blocksFor: (d: Date) => Block[];
  onPick: (d: Date) => void;
}) {
  const first  = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const blanks = Array(first.getDay()).fill(null);
  const days   = data?.days ?? [];

  return (
    <View style={s.month}>
      <View style={s.monthHead}>
        {DOW.map((w, i) => <Text key={i} style={s.monthDow}>{w}</Text>)}
      </View>
      <View style={s.monthGrid}>
        {blanks.map((_, i) => <View key={`b${i}`} style={s.monthCell} />)}
        {days.map((day) => {
          const date    = new Date(anchor.getFullYear(), anchor.getMonth(), day.day);
          const isSel   = sameDay(date, selected);
          const isToday = sameDay(date, today);
          const blocks  = blocksFor(date);
          return (
            <TouchableOpacity
              key={day.date}
              style={[s.monthCell, isSel && s.monthCellSel]}
              activeOpacity={0.7}
              onPress={() => onPick(date)}
            >
              {isToday ? (
                <GradientFill style={s.monthPill}>
                  <Text style={[s.monthNum, { color: C.white }]}>{day.day}</Text>
                </GradientFill>
              ) : (
                <View style={s.monthPill}>
                  <Text style={[s.monthNum, day.is_past && { color: C.light }]}>{day.day}</Text>
                </View>
              )}
              <View style={s.monthChips}>
                {blocks.slice(0, 2).map((b) => {
                  const col = colorFor(b.code || b.title);
                  return (
                    <View key={b.key} style={[s.monthChip, { backgroundColor: col.bg }]}>
                      <Text style={[s.monthChipText, { color: col.text }]} numberOfLines={1}>
                        {b.code || b.title}
                      </Text>
                    </View>
                  );
                })}
                {blocks.length > 2 && (
                  <Text style={s.monthMore}>+{blocks.length - 2}</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function AgendaRow({ title, code, when, custom, isWeak, onPress }: {
  title: string; code: string; when?: string; custom?: boolean; isWeak?: boolean; onPress: () => void;
}) {
  const col = colorFor(code || title);
  return (
    <TouchableOpacity style={s.agendaRow} activeOpacity={0.75} onPress={onPress}>
      <View style={[s.agendaBar, { backgroundColor: col.bar }]} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={s.agendaTopic} numberOfLines={1}>{title}</Text>
          {isWeak && <Ionicons name="flame" size={13} color={C.danger} />}
        </View>
        <Text style={s.agendaSub}>{[code, when].filter(Boolean).join(' · ')}</Text>
      </View>
      {custom && <Ionicons name="person-circle-outline" size={15} color={C.light} style={{ marginRight: 4 }} />}
      <Ionicons name="chevron-forward" size={16} color={C.light} />
    </TouchableOpacity>
  );
}

/* ── Layout + formatting helpers ────────────────────────────────────────────*/
/** Side-by-side lanes for blocks that share the same hours. */
function packLanes(blocks: Block[]): Block[] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end);
  const lanes: Block[][] = [];
  for (const b of sorted) {
    let idx = lanes.findIndex(l => l[l.length - 1].end <= b.start);
    if (idx === -1) { lanes.push([b]); idx = lanes.length - 1; }
    else lanes[idx].push(b);
    b.lane = idx;
  }
  return sorted.map(b => ({ ...b, lanes: lanes.length }));
}

function fmtHour(h: number) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  return `${h12} ${ampm}`;
}

function fmtShort(isoDate: string) {
  return parseISO(isoDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },

  /* Top bar */
  topBar:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: sp.sm, paddingTop: sp.sm },
  iconBtn:    { padding: 6 },
  monthTitle: { fontSize: 18, fontFamily: font.bold, color: C.text },
  // Calendar glyph with today's date inside it, like Google Calendar's.
  todayBtn:   { padding: 6, justifyContent: 'center', alignItems: 'center' },
  todayNum:   { position: 'absolute', fontSize: 9.5, fontFamily: font.bold, marginTop: 4 },

  /* Week / Month switch */
  switchRow: { flexDirection: 'row', gap: 6, paddingHorizontal: sp.md, paddingVertical: sp.sm },
  switchBtn: { paddingVertical: 6, paddingHorizontal: 18, borderRadius: 999 },
  switchOff: { backgroundColor: 'rgba(255,255,255,0.8)', borderWidth: 1, borderColor: C.border },
  switchText:{ fontSize: 13, fontFamily: font.semiBold, color: C.muted },

  /* Week strip */
  strip:     { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  stripCell: { flex: 1, alignItems: 'center', gap: 3 },
  stripDow:  { fontSize: 11, fontFamily: font.medium, color: C.muted },
  stripPill: { width: 34, height: 34, borderRadius: 11, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  stripNum:  { fontSize: 15, fontFamily: font.semiBold, color: C.text },
  stripDot:  { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },

  /* Time grid */
  gridRow:  { flexDirection: 'row' },
  hourCell: { height: HOUR_H, alignItems: 'flex-end', paddingRight: 6 },
  hourText: { fontSize: 10.5, fontFamily: font.medium, color: C.light, marginTop: -7 },
  col:         { width: COL_W, borderLeftWidth: 1, borderLeftColor: C.border },
  colSelected: { backgroundColor: 'rgba(165,32,32,0.035)' },
  hourSlot:    { height: HOUR_H, borderTopWidth: 1, borderTopColor: C.border },

  event:      { position: 'absolute', borderRadius: 6, flexDirection: 'row', overflow: 'hidden' },
  eventBar:   { width: 3.5 },
  eventBody:  { flex: 1, paddingHorizontal: 3, paddingVertical: 3 },
  eventCode:  { fontSize: 9, fontFamily: font.bold },
  eventTopic: { fontSize: 8.5, fontFamily: font.medium, lineHeight: 11 },

  nowLine: { position: 'absolute', left: GUTTER_W - 4, right: 0, flexDirection: 'row', alignItems: 'center' },
  nowDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EA4335' },
  nowBar:  { flex: 1, height: 1.5, backgroundColor: '#EA4335' },

  /* Month grid */
  month:        { paddingHorizontal: 2 },
  monthHead:    { flexDirection: 'row', paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: C.border },
  monthDow:     { flex: 1, textAlign: 'center', fontSize: 11, fontFamily: font.semiBold, color: C.muted },
  monthGrid:    { flexDirection: 'row', flexWrap: 'wrap' },
  monthCell:    { width: `${100 / 7}%`, height: 84, alignItems: 'center', paddingTop: 3, borderBottomWidth: 1, borderBottomColor: C.border },
  monthCellSel: { backgroundColor: 'rgba(165,32,32,0.05)' },
  monthPill:    { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  monthNum:     { fontSize: 13, fontFamily: font.medium, color: C.text },
  monthChips:   { alignSelf: 'stretch', paddingHorizontal: 2, gap: 2, marginTop: 2 },
  monthChip:    { borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1 },
  monthChipText:{ fontSize: 8, fontFamily: font.semiBold },
  monthMore:    { fontSize: 8, fontFamily: font.medium, color: C.light, paddingLeft: 3 },

  /* Agenda */
  agendaBlock: { paddingHorizontal: sp.md, paddingTop: sp.md },
  agendaHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: sp.xs },
  agendaTitle: { fontSize: 14, fontFamily: font.bold, color: C.text },
  agendaAdd:   { fontSize: 13, fontFamily: font.bold, color: C.accent },
  agendaRow:   { flexDirection: 'row', alignItems: 'center', gap: sp.sm, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  agendaBar:   { width: 4, height: 30, borderRadius: 2 },
  agendaTopic: { fontSize: 14, fontFamily: font.semiBold, color: C.text },
  agendaSub:   { fontSize: 12, fontFamily: font.regular, color: C.muted, marginTop: 1 },

  emptySub: { fontSize: 12.5, fontFamily: font.regular, color: C.light, paddingVertical: sp.sm },

  /* FAB */
  fab:     { position: 'absolute', right: 20, bottom: 104, width: 56, height: 56, borderRadius: 28 },
  fabFill: { width: '100%', height: '100%', borderRadius: 28, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },

  /* Sheets */
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: sp.lg,
    paddingBottom: 34,
    gap: sp.sm,
  },
  sheetTop:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetSwatch:   { width: 12, height: 12, borderRadius: 3 },
  sheetTitle:    { flex: 1, fontSize: 18, fontFamily: font.bold, color: C.text },
  sheetWhen:     { fontSize: 13, fontFamily: font.regular, color: C.muted },
  sheetMeta:     { flexDirection: 'row', alignItems: 'center', gap: sp.sm, marginBottom: sp.xs },
  sheetChip:     { paddingHorizontal: 10, paddingVertical: 3, borderRadius: r.full },
  sheetChipText: { fontSize: 11, fontFamily: font.bold },
  sheetCount:    { fontSize: 12.5, fontFamily: font.medium, color: C.muted },
  sheetBtnText:  { fontSize: 15, fontFamily: font.bold, color: C.white },
  deleteBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  deleteText:    { fontSize: 14, fontFamily: font.semiBold, color: C.danger },

  /* Form */
  formLabel: { fontSize: 12.5, fontFamily: font.semiBold, color: C.muted, marginTop: 2 },

  /* Topic dropdown */
  select: {
    flexDirection: 'row', alignItems: 'center', gap: sp.sm,
    backgroundColor: C.bg, borderRadius: r.md, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: sp.md, paddingVertical: 12,
  },
  selectOff:  { opacity: 0.6 },
  selectText: { flex: 1, fontSize: 14.5, fontFamily: font.medium, color: C.text },
  dropdown: {
    borderWidth: 1, borderColor: C.border, borderRadius: r.md,
    backgroundColor: C.card, overflow: 'hidden', marginTop: -4,
  },
  dropdownRow: {
    flexDirection: 'row', alignItems: 'center', gap: sp.sm,
    paddingHorizontal: sp.md, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  dropdownRowOn: { backgroundColor: C.primary + '0D' },
  dropdownText:  { flex: 1, fontSize: 14, fontFamily: font.regular, color: C.text },
  dropdownMeta:  { fontSize: 11.5, fontFamily: font.medium, color: C.light },
  dropdownEmpty: { fontSize: 13, fontFamily: font.regular, color: C.muted, padding: sp.md },
  chipRow:     { flexDirection: 'row', gap: 6 },
  chip:        { paddingHorizontal: 12, paddingVertical: 7, borderRadius: r.full, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, marginRight: 6 },
  chipOn:      { backgroundColor: C.primary, borderColor: C.primary },
  chipText:    { fontSize: 12.5, fontFamily: font.semiBold, color: C.muted },
  chipTextOn:  { color: C.white },
  stepper:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.bg, borderRadius: r.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: 6, paddingVertical: 4 },
  stepBtn:     { padding: 6 },
  stepValue:   { fontSize: 14, fontFamily: font.semiBold, color: C.text },
  formActions: { flexDirection: 'row', gap: sp.sm, marginTop: sp.sm },
  cancelBtn:   { paddingHorizontal: 18, justifyContent: 'center', borderRadius: r.md, borderWidth: 1, borderColor: C.border },
  cancelText:  { fontSize: 14, fontFamily: font.semiBold, color: C.muted },
});
