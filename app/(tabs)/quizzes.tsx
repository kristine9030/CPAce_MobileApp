import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, TextInput,
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
  { key: 'topic',     label: 'By Topic',  icon: 'book',     desc: 'Focus on one or more subject areas',           color: C.accent },
  { key: 'timed',     label: 'Timed',     icon: 'timer',    desc: 'Beat the clock — 30 seconds per question',     color: C.accent },
  { key: 'challenge', label: 'Challenge', icon: 'trophy',   desc: 'Hardest questions first, for 1.5× points',     color: C.primary },
] as const;

const FORMATS = [
  { key: 'testing',  label: 'Testing',  icon: 'school',        desc: 'Answer everything first, then review results at the end' },
  { key: 'training', label: 'Training', icon: 'bulb',           desc: 'See the correct answer right after each question' },
] as const;

const MAX_ITEMS = 100;
const ITEMS_OPTIONS = [5, 10, 20, 30, 50] as const;

export default function QuizzesScreen() {
  const router              = useRouter();
  const params              = useLocalSearchParams<{ subjectId?: string; subjectCode?: string }>();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [mode, setMode]         = useState<string>('adaptive');
  const [sessionType, setSessionType] = useState<string>('testing');
  const [selectedSubjects, setSelectedSubjects] = useState<number[]>(params.subjectId ? [Number(params.subjectId)] : []);
  const [numItems, setNumItems]               = useState<number>(10);
  const [customItems, setCustomItems]         = useState<string>('');
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

  const toggleSubject = (id: number) => {
    setSelectedSubjects((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  };

  const applyCustomItems = (text: string) => {
    setCustomItems(text.replace(/[^0-9]/g, ''));
    const n = Number(text);
    if (Number.isFinite(n) && n > 0) setNumItems(Math.max(1, Math.min(n, MAX_ITEMS)));
  };

  const startQuiz = async () => {
    if (mode === 'topic' && selectedSubjects.length === 0) {
      Alert.alert('Select a Subject', 'Please choose at least one subject for Topic mode.');
      return;
    }
    setStarting(true);
    try {
      const payload: Record<string, any> = { mode, num_items: numItems, session_type: sessionType };
      if (mode === 'topic' && selectedSubjects.length) payload.subject_ids = selectedSubjects;
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

        {/* Subject Selection (shown for Topic mode, multi-select like the web version) */}
        {mode === 'topic' && (
          <>
            <View style={s.sectionHead}>
              <Text style={s.sectionTitle}>Select Subject(s)</Text>
              <View style={{ flexDirection: 'row', gap: sp.sm }}>
                <TouchableOpacity onPress={() => setSelectedSubjects(subjects.map((s2) => s2.id))}>
                  <Text style={s.linkText}>Select all</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSelectedSubjects([])}>
                  <Text style={s.linkText}>Clear</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={s.subjectWrap}>
              {subjects.map((sub) => (
                selectedSubjects.includes(sub.id) ? (
                  <GradientButton
                    key={sub.id}
                    radius={r.full}
                    contentStyle={s.subjectChipActive}
                    onPress={() => toggleSubject(sub.id)}
                  >
                    <Ionicons name="checkmark" size={13} color={C.white} />
                    <Text style={[s.subjectChipText, { color: C.white }]}>{sub.code}</Text>
                  </GradientButton>
                ) : (
                  <TouchableOpacity
                    key={sub.id}
                    style={s.subjectChip}
                    onPress={() => toggleSubject(sub.id)}
                  >
                    <Text style={s.subjectChipText}>{sub.code}</Text>
                  </TouchableOpacity>
                )
              ))}
            </View>
            {selectedSubjects.length > 0 && (
              <Text style={s.noticeText}>{selectedSubjects.length} subject{selectedSubjects.length > 1 ? 's' : ''} selected</Text>
            )}
          </>
        )}

        {/* Format: Testing vs Training */}
        <Text style={s.sectionTitle}>Format</Text>
        {FORMATS.map((f) => {
          const selected = sessionType === f.key;
          const body = (
            <View style={s.modeCard}>
              {selected ? (
                <GradientFill style={s.modeIcon}>
                  <Ionicons name={f.icon as any} size={20} color={C.white} />
                </GradientFill>
              ) : (
                <View style={[s.modeIcon, { backgroundColor: C.accent + '20' }]}>
                  <Ionicons name={f.icon as any} size={20} color={C.accent} />
                </View>
              )}
              <View style={{ flex: 1, marginLeft: sp.md }}>
                <Text style={s.modeLabel}>{f.label}</Text>
                <Text style={s.modeDesc}>{f.desc}</Text>
              </View>
              {selected && <Ionicons name="checkmark-circle" size={22} color={C.primary} />}
            </View>
          );
          return (
            <TouchableOpacity key={f.key} style={s.modeCardWrap} onPress={() => setSessionType(f.key)}>
              {selected
                ? <GradientBorder radius={r.lg} width={2}>{body}</GradientBorder>
                : <View style={s.modeCardPlain}>{body}</View>}
            </TouchableOpacity>
          );
        })}

        {/* Number of Items — same picker for every mode, up to 100 like the web version */}
        <Text style={s.sectionTitle}>Number of Questions</Text>
        <View style={s.numRow}>
          {ITEMS_OPTIONS.map((n) => (
            numItems === n ? (
              <GradientButton
                key={n}
                radius={r.md}
                style={{ flex: 1 }}
                contentStyle={s.numBtnActive}
                onPress={() => { setNumItems(n); setCustomItems(''); }}
              >
                <Text style={[s.numBtnText, s.numBtnTextActive]}>{n}</Text>
              </GradientButton>
            ) : (
              <TouchableOpacity
                key={n}
                style={s.numBtn}
                onPress={() => { setNumItems(n); setCustomItems(''); }}
              >
                <Text style={s.numBtnText}>{n}</Text>
              </TouchableOpacity>
            )
          ))}
        </View>
        <View style={s.customRow}>
          <Text style={s.customLabel}>Custom (1–{MAX_ITEMS}):</Text>
          <TextInput
            style={s.customInput}
            value={customItems}
            onChangeText={applyCustomItems}
            placeholder={String(numItems)}
            placeholderTextColor={C.light}
            keyboardType="number-pad"
            maxLength={3}
          />
        </View>
        <Text style={s.noticeText}>{numItems} question{numItems > 1 ? 's' : ''} selected</Text>

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
  sectionHead:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: sp.sm },
  linkText:      { fontSize: 12.5, fontFamily: font.semiBold, color: C.accent },
  modeCardWrap:  { borderRadius: r.lg, marginBottom: sp.sm, },
  modeCardPlain: { borderRadius: r.lg, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  modeCard:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: r.lg - 2, padding: sp.md, overflow: 'hidden' },
  modeIcon:      { width: 44, height: 44, borderRadius: r.md, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  modeLabel:     { ...type.cardTitle },
  modeDesc:      { fontSize: 12, fontFamily: font.regular, color: C.muted, marginTop: 2 },
  subjectWrap:   { flexDirection: 'row', flexWrap: 'wrap', gap: sp.sm, marginBottom: sp.sm },
  subjectChip:   { paddingHorizontal: sp.md, paddingVertical: sp.sm, borderRadius: r.full, backgroundColor: 'rgba(255,255,255,0.78)', borderWidth: 1, borderColor: C.border },
  subjectChipActive: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: sp.md, paddingVertical: sp.sm },
  subjectChipText:{ fontSize: 13, fontFamily: font.semiBold, color: C.text },
  numRow:        { flexDirection: 'row', gap: sp.sm, marginBottom: sp.md },
  numBtn:        { flex: 1, paddingVertical: 10, borderRadius: r.md, backgroundColor: 'rgba(255,255,255,0.78)', borderWidth: 1, borderColor: C.border, alignItems: 'center', ...sh.sm },
  numBtnActive:  { paddingVertical: 11 },
  numBtnText:    { fontSize: 16, fontFamily: font.bold, color: C.muted },
  numBtnTextActive:{ color: C.white },
  customRow:     { flexDirection: 'row', alignItems: 'center', gap: sp.sm, marginBottom: sp.xs },
  customLabel:   { fontSize: 13, fontFamily: font.medium, color: C.muted },
  customInput:   { flex: 1, paddingHorizontal: sp.md, paddingVertical: 8, borderRadius: r.md, backgroundColor: 'rgba(255,255,255,0.78)', borderWidth: 1, borderColor: C.border, fontSize: 15, fontFamily: font.semiBold, color: C.text },
  noticeText:    { fontSize: 13, fontFamily: font.regular, color: C.muted, textAlign: 'center', marginVertical: sp.sm, fontStyle: 'italic' },
  startBtnWrap:  { marginTop: sp.md },
  startBtn:      { paddingVertical: 16, gap: sp.sm },
  startText:     { color: C.white, fontSize: 17, fontFamily: font.extraBold },
});
