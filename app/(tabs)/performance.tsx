import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client from '@/lib/api/client';
import { C, sp, r, font, type } from '@/constants/cpace-theme';
import { ScreenHeader } from '@/components/ui/screen-header';
import { GradientFill } from '@/components/ui/gradient';

interface PerfData {
  overall_accuracy: number;
  total_sessions: number;
  total_questions: number;
  average_score: number;
  best_streak: number;
  study_hours: number;
  daily_series: { date: string; questions: number; accuracy: number }[];
  strengths:   { topic: string; subject_code: string; accuracy_rate: number; attempts: number }[];
  weaknesses:  { topic: string; subject_code: string; accuracy_rate: number; attempts: number }[];
  by_subject:  { subject_id: number; code: string; name: string; color: string; accuracy: number; sessions: number }[];
  by_quiz_type: { mode: string; sessions: number; avg_score: number }[];
}

/* ── Chart tokens ───────────────────────────────────────────────────────────
   Magnitude is a single hue (bars and meters all plot the same measure, so the
   row label carries identity — colouring per category would just re-encode bar
   length). Status is a validated two-state scale: mixing an amber third state
   in fails the normal-vision separation floor against the red. Both statuses
   always ship with an icon and a written label, never colour alone. */
const VIZ = {
  fill:  '#A52020',   // sequential fill — L .49 / C .16 / 5.1:1 on surface
  track: '#F3DEDE',   // lighter step of the same ramp
  grid:  C.border,    // hairline, one step off surface
  good:  '#21a366',
  bad:   '#c0392b',
} as const;

const PLOT_H  = 104;
const BAR_MAX = 24;

const MODE_ICONS: Record<string, any> = {
  adaptive: 'sparkles', topic: 'book', timed: 'timer', challenge: 'trophy',
};

export default function PerformanceScreen() {
  const router                = useRouter();
  const [data, setData]       = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [asTable, setTable]   = useState(false);

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

  const d        = data!;
  const series   = d?.daily_series ?? [];
  const max7     = Math.max(...series.map(x => x.questions), 1);
  const peakIdx  = series.reduce((best, x, i) => (x.questions > series[best].questions ? i : best), 0);
  const accuracy = Math.round(d?.overall_accuracy ?? 0);
  const hasAny   = (d?.total_sessions ?? 0) > 0;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader
        title="Performance"
        subtitle="Your learning analytics"
        onBack={() => router.push('/(tabs)')}
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => load(true)} tintColor={C.accent} />}
      >
        {/* ── Hero: the one number this screen leads with ── */}
        <GradientFill style={s.hero}>
          <View style={s.heroDecor1} />
          <View style={s.heroDecor2} />

          <Text style={s.heroLabel}>Overall accuracy</Text>
          <Text style={s.heroValue}>{accuracy}%</Text>
          <Text style={s.heroSub}>
            {compact(d?.total_questions ?? 0)} questions · {compact(d?.total_sessions ?? 0)} sessions
          </Text>

          {/* Single ratio against a limit — a meter, not a chart */}
          <View style={s.heroTrack}>
            <View style={[s.heroFill, { width: `${clamp(accuracy)}%` }]} />
            {/* the notch sits at the real 75% position, so the scale can't lie */}
            <View style={s.heroNotch} />
          </View>
          <View style={s.heroScale}>
            <Text style={s.heroTick}>0%</Text>
            <View style={s.heroLegend}>
              <View style={s.heroLegendDash} />
              <Text style={s.heroTick}>Passing mark 75%</Text>
            </View>
            <Text style={s.heroTick}>100%</Text>
          </View>
        </GradientFill>

        {/* ── KPI tiles ── */}
        <View style={s.kpiRow}>
          <Kpi icon="albums-outline"    label="Sessions"    value={compact(d?.total_sessions ?? 0)} />
          <Kpi icon="help-circle-outline" label="Questions" value={compact(d?.total_questions ?? 0)} />
        </View>
        <View style={s.kpiRow}>
          <Kpi icon="time-outline"  label="Study time"  value={`${d?.study_hours ?? 0}h`} />
          <Kpi icon="flame-outline" label="Best streak" value={`${d?.best_streak ?? 0} days`} />
        </View>

        {/* ── 7-day activity ── */}
        {series.length > 0 && (
          <Card
            title="Questions answered"
            subtitle="Last 7 days"
            action={
              <TouchableOpacity onPress={() => setTable(v => !v)} hitSlop={8} style={s.cardAction}>
                <Ionicons name={asTable ? 'bar-chart-outline' : 'list-outline'} size={16} color={C.muted} />
                <Text style={s.cardActionText}>{asTable ? 'Chart' : 'Values'}</Text>
              </TouchableOpacity>
            }
          >
            {asTable ? (
              /* Table view — the same values without relying on the chart */
              <View>
                <View style={s.tHead}>
                  <Text style={[s.tCell, s.tHeadText, { flex: 1.2 }]}>Day</Text>
                  <Text style={[s.tCell, s.tHeadText, s.tRight]}>Questions</Text>
                  <Text style={[s.tCell, s.tHeadText, s.tRight]}>Accuracy</Text>
                </View>
                {series.map((day, i) => (
                  <View key={i} style={s.tRow}>
                    <Text style={[s.tCell, { flex: 1.2 }]}>{longDate(day.date)}</Text>
                    <Text style={[s.tCell, s.tRight, s.tNum]}>{day.questions}</Text>
                    <Text style={[s.tCell, s.tRight, s.tNum]}>{Math.round(day.accuracy)}%</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View>
                <View style={s.plot}>
                  {/* recessive hairline grid */}
                  <View style={[s.grid, { top: 0 }]} />
                  <View style={[s.grid, { top: PLOT_H / 2 }]} />
                  <View style={[s.grid, { bottom: 0 }]} />
                  <Text style={s.axisMax}>{max7}</Text>

                  <View style={s.bars}>
                    {series.map((day, i) => (
                      <View key={i} style={s.barCol}>
                        {i === peakIdx && day.questions > 0 && (
                          <Text style={s.barValue}>{day.questions}</Text>
                        )}
                        <View
                          style={[
                            s.bar,
                            {
                              height: Math.max((day.questions / max7) * (PLOT_H - 18), day.questions > 0 ? 3 : 0),
                            },
                          ]}
                        />
                      </View>
                    ))}
                  </View>
                </View>

                <View style={s.bars}>
                  {series.map((day, i) => (
                    <View key={i} style={s.barCol}>
                      <Text style={[s.barLabel, i === series.length - 1 && s.barLabelToday]}>
                        {shortDate(day.date)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </Card>
        )}

        {/* ── Accuracy by subject ── */}
        {d?.by_subject?.length > 0 && (
          <Card title="Accuracy by subject" subtitle="Correct answers per subject">
            {[...d.by_subject].sort((a, b) => b.accuracy - a.accuracy).map((sub) => (
              <View key={sub.subject_id} style={s.meterRow}>
                <View style={s.meterHead}>
                  <Text style={s.meterName} numberOfLines={1}>{sub.code}</Text>
                  <Text style={s.meterMeta}>{sub.sessions} session{sub.sessions === 1 ? '' : 's'}</Text>
                  <Text style={s.meterValue}>{Math.round(sub.accuracy)}%</Text>
                </View>
                <View style={s.track}>
                  <View style={[s.fill, { width: `${clamp(sub.accuracy)}%` }]} />
                </View>
              </View>
            ))}
          </Card>
        )}

        {/* ── Topic status ── */}
        {d?.strengths?.length > 0 && (
          <Card title="Strong topics" subtitle="75% accuracy and above">
            {d.strengths.map((item, i) => (
              <TopicRow key={i} item={item} status="good" />
            ))}
          </Card>
        )}

        {d?.weaknesses?.length > 0 && (
          <Card title="Needs work" subtitle="Below 60% accuracy">
            {d.weaknesses.map((item, i) => (
              <TopicRow key={i} item={item} status="bad" />
            ))}
          </Card>
        )}

        {/* ── By quiz mode ── */}
        {d?.by_quiz_type?.length > 0 && (
          <Card title="By quiz mode" subtitle="Average score per mode">
            {d.by_quiz_type.map((item, i) => (
              <View key={i} style={s.meterRow}>
                <View style={s.meterHead}>
                  <Ionicons name={MODE_ICONS[item.mode] ?? 'ellipse-outline'} size={14} color={C.muted} />
                  <Text style={s.meterName}>{item.mode.charAt(0).toUpperCase() + item.mode.slice(1)}</Text>
                  <Text style={s.meterMeta}>{item.sessions} session{item.sessions === 1 ? '' : 's'}</Text>
                  <Text style={s.meterValue}>{Math.round(item.avg_score)}%</Text>
                </View>
                <View style={s.track}>
                  <View style={[s.fill, { width: `${clamp(item.avg_score)}%` }]} />
                </View>
              </View>
            ))}
          </Card>
        )}

        {!hasAny && (
          <View style={s.empty}>
            <Ionicons name="bar-chart-outline" size={44} color={C.light} />
            <Text style={s.emptyText}>No quiz activity yet.</Text>
            <Text style={s.emptySub}>Finish a quiz and your analytics will show up here.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────────────*/
function Card({ title, subtitle, action, children }: {
  title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <View style={s.cardWrap}>
      <View style={s.card}>
        <View style={s.cardHead}>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{title}</Text>
            {!!subtitle && <Text style={s.cardSub}>{subtitle}</Text>}
          </View>
          {action}
        </View>
        {children}
      </View>
    </View>
  );
}

function Kpi({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={s.kpiWrap}>
      <View style={s.kpi}>
        <View style={s.kpiIcon}>
          <Ionicons name={icon} size={15} color={C.primary} />
        </View>
        <Text style={s.kpiValue}>{value}</Text>
        <Text style={s.kpiLabel}>{label}</Text>
      </View>
    </View>
  );
}

/** Status rows always carry an icon and a written state, never colour alone. */
function TopicRow({ item, status }: {
  item: { topic: string; subject_code: string; accuracy_rate: number; attempts: number };
  status: 'good' | 'bad';
}) {
  const pct   = Math.round(item.accuracy_rate * 100);
  const color = status === 'good' ? VIZ.good : VIZ.bad;
  return (
    <View style={s.topicRow}>
      <Ionicons
        name={status === 'good' ? 'checkmark-circle' : 'alert-circle'}
        size={17}
        color={color}
      />
      <View style={{ flex: 1 }}>
        <Text style={s.topicName} numberOfLines={1}>{item.topic}</Text>
        <Text style={s.topicSub}>
          {item.subject_code} · {item.attempts} attempt{item.attempts === 1 ? '' : 's'} ·{' '}
          {status === 'good' ? 'Strong' : 'Needs work'}
        </Text>
      </View>
      <Text style={s.topicPct}>{pct}%</Text>
    </View>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────────────*/
const clamp = (n: number) => Math.max(0, Math.min(100, n));

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function shortDate(str: string) {
  const [y, m, d] = str.split('-').map(Number);
  const date = Number.isFinite(y) ? new Date(y, (m ?? 1) - 1, d ?? 1) : new Date(str);
  return date.toLocaleDateString('en-PH', { weekday: 'short' }).slice(0, 3);
}

function longDate(str: string) {
  const [y, m, d] = str.split('-').map(Number);
  const date = Number.isFinite(y) ? new Date(y, (m ?? 1) - 1, d ?? 1) : new Date(str);
  return date.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },

  /* Hero */
  hero: {
    marginHorizontal: sp.md,
    marginTop: sp.xs,
    borderRadius: 22,
    padding: sp.lg,
    overflow: 'hidden',
  },
  heroDecor1: { position: 'absolute', top: -46, right: -30, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.07)' },
  heroDecor2: { position: 'absolute', bottom: -60, left: -24, width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.05)' },
  heroLabel:  { fontSize: 12.5, fontFamily: font.medium, color: 'rgba(255,255,255,0.75)' },
  heroValue:  { fontSize: 52, lineHeight: 60, fontFamily: font.extraBold, color: C.white },
  heroSub:    { fontSize: 12.5, fontFamily: font.regular, color: 'rgba(255,255,255,0.8)' },
  heroTrack:  { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.22)', marginTop: sp.md, overflow: 'hidden' },
  heroFill:   { height: 8, borderRadius: 4, backgroundColor: C.white },
  heroNotch:  { position: 'absolute', left: '75%', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,255,255,0.55)' },
  heroScale:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 },
  heroTick:   { fontSize: 10, fontFamily: font.medium, color: 'rgba(255,255,255,0.6)' },
  heroLegend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroLegendDash: { width: 2, height: 9, backgroundColor: 'rgba(255,255,255,0.55)' },

  /* KPI tiles */
  kpiRow:   { flexDirection: 'row', gap: sp.sm, paddingHorizontal: sp.md, marginTop: sp.sm },
  kpiWrap:  { flex: 1, borderRadius: r.lg, overflow: 'hidden' },
  kpi:      { backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: r.lg, padding: sp.md, gap: 2, overflow: 'hidden' },
  kpiIcon:  { width: 26, height: 26, borderRadius: 13, backgroundColor: C.primary + '14', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  kpiValue: { fontSize: 22, fontFamily: font.extraBold, color: C.text },
  kpiLabel: { ...type.statLabel },

  /* Cards */
  cardWrap:  { borderRadius: r.lg, marginHorizontal: sp.md, marginTop: sp.md, overflow: 'hidden' },
  card:      { backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: r.lg, padding: sp.md, overflow: 'hidden' },
  cardHead:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: sp.md },
  cardTitle: { fontSize: 15, fontFamily: font.bold, color: C.text },
  cardSub:   { fontSize: 11.5, fontFamily: font.regular, color: C.muted, marginTop: 1 },
  cardAction:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingHorizontal: 6 },
  cardActionText: { fontSize: 12, fontFamily: font.semiBold, color: C.muted },

  /* Bar chart */
  plot:    { height: PLOT_H, justifyContent: 'flex-end', marginTop: 14 },
  grid:    { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: VIZ.grid },
  // Sits above the top gridline so it can never collide with a bar's value label.
  axisMax: { position: 'absolute', top: -13, right: 0, fontSize: 10, fontFamily: font.medium, color: C.light },
  bars:    { flexDirection: 'row', alignItems: 'flex-end' },
  barCol:  { flex: 1, alignItems: 'center', paddingHorizontal: 2 },
  bar: {
    width: '100%',
    maxWidth: BAR_MAX,
    backgroundColor: VIZ.fill,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  barValue:      { fontSize: 10.5, fontFamily: font.bold, color: C.text, marginBottom: 3 },
  barLabel:      { fontSize: 10, fontFamily: font.medium, color: C.light, marginTop: 6 },
  barLabelToday: { color: C.text, fontFamily: font.bold },

  /* Table view */
  tHead:     { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  tHeadText: { fontFamily: font.semiBold, color: C.muted, fontSize: 11 },
  tRow:      { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  tCell:     { flex: 1, fontSize: 12.5, fontFamily: font.regular, color: C.text },
  tRight:    { textAlign: 'right' },
  tNum:      { fontVariant: ['tabular-nums'] },

  /* Meters */
  meterRow:   { marginBottom: sp.md },
  meterHead:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  meterName:  { fontSize: 13, fontFamily: font.semiBold, color: C.text },
  meterMeta:  { flex: 1, fontSize: 11, fontFamily: font.regular, color: C.light },
  meterValue: { fontSize: 13, fontFamily: font.bold, color: C.text, fontVariant: ['tabular-nums'] },
  track:      { height: 8, borderRadius: 4, backgroundColor: VIZ.track, overflow: 'hidden' },
  fill:       { height: 8, borderRadius: 4, backgroundColor: VIZ.fill },

  /* Topic status rows */
  topicRow:  { flexDirection: 'row', alignItems: 'center', gap: sp.sm, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.border },
  topicName: { fontSize: 13.5, fontFamily: font.semiBold, color: C.text },
  topicSub:  { fontSize: 11, fontFamily: font.regular, color: C.muted, marginTop: 1 },
  topicPct:  { fontSize: 15, fontFamily: font.extraBold, color: C.text, fontVariant: ['tabular-nums'] },

  /* Empty */
  empty:     { alignItems: 'center', paddingTop: 56, gap: 6 },
  emptyText: { fontSize: 14, fontFamily: font.semiBold, color: C.muted },
  emptySub:  { fontSize: 12, fontFamily: font.regular, color: C.light, textAlign: 'center', paddingHorizontal: sp.xl },
});
