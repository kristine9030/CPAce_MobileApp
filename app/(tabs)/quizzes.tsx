import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client from '@/lib/api/client';
import { C, sp, r, sh, font, type, grad } from '@/constants/cpace-theme';
import { ScreenHeader } from '@/components/ui/screen-header';
import { GradientBorder, GradientButton, GradientFill } from '@/components/ui/gradient';

interface Subject { id: number; code: string; name: string; color: string }

const MODES = [
  { key: 'adaptive',  label: 'Adaptive',  icon: 'sparkles', desc: 'AI-powered questions based on your weaknesses', color: C.primary },
  { key: 'topic',     label: 'By Topic',  icon: 'book',     desc: 'Focus on a specific subject area',             color: C.accent },
  { key: 'timed',     label: 'Timed',     icon: 'timer',    desc: '10-question timed sprint, 30 seconds each',    color: C.accent },
  { key: 'challenge', label: 'Challenge', icon: 'trophy',   desc: '20 hard questions for exam simulation',        color: C.primary },
] as const;

const ITEMS_OPTIONS = [5, 10, 15, 20] as const;

export default function QuizzesScreen() {
  const router              = useRouter();
  const params              = useLocalSearchParams<{ subjectId?: string; subjectCode?: string }>();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [mode, setMode]         = useState<string>('adaptive');
  const [selectedSubject, setSelectedSubject] = useState<number | null>(params.subjectId ? Number(params.subjectId) : null);
  const [numItems, setNumItems]               = useState<number>(10);
  const [loading, setLoading]                 = useState(true);
  const [starting, setStarting]               = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await client.get('/subjects');
      setSubjects(res.data.subjects ?? res.data);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const startQuiz = async () => {
    if ((mode === 'topic') && !selectedSubject) {
      Alert.alert('Select a Subject', 'Please choose a subject for Topic mode.');
      return;
    }
    setStarting(true);
    try {
      const payload: Record<string, any> = { mode, num_items: numItems };
      if (selectedSubject && mode === 'topic') payload.subject_id = selectedSubject;
      const res = await client.post('/quizzes/start', payload);
      router.push({ pathname: '/quiz/[id]', params: { id: String(res.data.session_id) } });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not start quiz.');
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={C.accent} /></View>;
  }

  const currentMode = MODES.find(m => m.key === mode)!;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader
        title="Quizzes"
        subtitle="Choose a mode and start practicing"
        onBack={() => router.push('/(tabs)')}
        right={
          <TouchableOpacity onPress={() => router.push('/quiz/history')} style={s.histBtn}>
            <Ionicons name="time" size={18} color={C.accent} />
            <Text style={s.histText}>History</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={{ padding: sp.md }}>

        {/* Mode Selection */}
        <Text style={s.sectionTitle}>Quiz Mode</Text>
        {MODES.map((m) => {
          const selected = mode === m.key;
          const body = (
            <View style={s.modeCard}>
              {selected ? (
                <GradientFill style={s.modeIcon}>
                  <Ionicons name={m.icon as any} size={22} color={C.white} />
                </GradientFill>
              ) : (
                <View style={[s.modeIcon, { backgroundColor: m.color + '20' }]}>
                  <Ionicons name={m.icon as any} size={22} color={m.color} />
                </View>
              )}
              <View style={{ flex: 1, marginLeft: sp.md }}>
                <Text style={s.modeLabel}>{m.label}</Text>
                <Text style={s.modeDesc}>{m.desc}</Text>
              </View>
              {selected && <Ionicons name="checkmark-circle" size={22} color={C.primary} />}
            </View>
          );

          return (
            <TouchableOpacity
              key={m.key}
              style={s.modeCardWrap}
              onPress={() => setMode(m.key)}
            >
              {selected
                ? <GradientBorder radius={r.lg} width={2}>{body}</GradientBorder>
                : <View style={s.modeCardPlain}>{body}</View>}
            </TouchableOpacity>
          );
        })}

        {/* Subject Selection (shown for Topic mode) */}
        {mode === 'topic' && (
          <>
            <Text style={s.sectionTitle}>Select Subject</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: sp.md }}>
              {subjects.map((sub) => (
                selectedSubject === sub.id ? (
                  <GradientButton
                    key={sub.id}
                    radius={r.full}
                    style={{ marginRight: sp.sm }}
                    contentStyle={s.subjectChipActive}
                    onPress={() => setSelectedSubject(sub.id)}
                  >
                    <Text style={[s.subjectChipText, { color: C.white }]}>{sub.code}</Text>
                  </GradientButton>
                ) : (
                  <TouchableOpacity
                    key={sub.id}
                    style={s.subjectChip}
                    onPress={() => setSelectedSubject(sub.id)}
                  >
                    <Text style={s.subjectChipText}>{sub.code}</Text>
                  </TouchableOpacity>
                )
              ))}
            </ScrollView>
          </>
        )}

        {/* Number of Items */}
        {mode !== 'timed' && mode !== 'challenge' && (
          <>
            <Text style={s.sectionTitle}>Number of Questions</Text>
            <View style={s.numRow}>
              {ITEMS_OPTIONS.map((n) => (
                numItems === n ? (
                  <GradientButton
                    key={n}
                    radius={r.md}
                    style={{ flex: 1 }}
                    contentStyle={s.numBtnActive}
                    onPress={() => setNumItems(n)}
                  >
                    <Text style={[s.numBtnText, s.numBtnTextActive]}>{n}</Text>
                  </GradientButton>
                ) : (
                  <TouchableOpacity
                    key={n}
                    style={s.numBtn}
                    onPress={() => setNumItems(n)}
                  >
                    <Text style={s.numBtnText}>{n}</Text>
                  </TouchableOpacity>
                )
              ))}
            </View>
          </>
        )}
        {mode === 'timed'     && <Text style={s.noticeText}>Timed mode: 10 questions · 30 seconds each</Text>}
        {mode === 'challenge' && <Text style={s.noticeText}>Challenge mode: 20 hard questions · simulate the board exam</Text>}

        {/* Start Button */}
        <GradientButton
          radius={r.lg}
          colors={grad.brand}
          style={s.startBtnWrap}
          contentStyle={s.startBtn}
          onPress={startQuiz}
          loading={starting}
        >
          <Ionicons name="play" size={20} color={C.white} />
          <Text style={s.startText}>Start {currentMode.label} Quiz</Text>
        </GradientButton>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.bg },
  center:        { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  histBtn:       { flexDirection: 'row', alignItems: 'center', gap: sp.xs },
  histText:      { color: C.accent, fontSize: 13, fontFamily: font.semiBold },
  sectionTitle:  { ...type.sectionTitle, marginBottom: sp.sm, marginTop: sp.sm },
  modeCardWrap:  { borderRadius: r.lg, marginBottom: sp.sm, },
  modeCardPlain: { borderRadius: r.lg, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  modeCard:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: r.lg - 2, padding: sp.md, overflow: 'hidden' },
  modeIcon:      { width: 44, height: 44, borderRadius: r.md, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  modeLabel:     { ...type.cardTitle },
  modeDesc:      { fontSize: 12, fontFamily: font.regular, color: C.muted, marginTop: 2 },
  subjectChip:   { paddingHorizontal: sp.md, paddingVertical: sp.sm, borderRadius: r.full, backgroundColor: 'rgba(255,255,255,0.78)', borderWidth: 1, borderColor: C.border, marginRight: sp.sm },
  subjectChipActive: { paddingHorizontal: sp.md, paddingVertical: sp.sm },
  subjectChipText:{ fontSize: 13, fontFamily: font.semiBold, color: C.text },
  numRow:        { flexDirection: 'row', gap: sp.sm, marginBottom: sp.md },
  numBtn:        { flex: 1, paddingVertical: 10, borderRadius: r.md, backgroundColor: 'rgba(255,255,255,0.78)', borderWidth: 1, borderColor: C.border, alignItems: 'center', ...sh.sm },
  numBtnActive:  { paddingVertical: 11 },
  numBtnText:    { fontSize: 16, fontFamily: font.bold, color: C.muted },
  numBtnTextActive:{ color: C.white },
  noticeText:    { fontSize: 13, fontFamily: font.regular, color: C.muted, textAlign: 'center', marginVertical: sp.sm, fontStyle: 'italic' },
  startBtnWrap:  { marginTop: sp.md },
  startBtn:      { paddingVertical: 16, gap: sp.sm },
  startText:     { color: C.white, fontSize: 17, fontFamily: font.extraBold },
});
