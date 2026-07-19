import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client from '@/lib/api/client';
import { C, sp, r, sh } from '@/constants/cpace-theme';

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
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <TouchableOpacity onPress={() => router.push('/(tabs)')} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color={C.white} />
          </TouchableOpacity>
          <Text style={s.title}>Quizzes</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/quiz/history')} style={s.histBtn}>
          <Ionicons name="time" size={18} color={C.white} />
          <Text style={s.histText}>History</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: sp.md }}>

        {/* Mode Selection */}
        <Text style={s.sectionTitle}>Quiz Mode</Text>
        {MODES.map((m) => (
          <TouchableOpacity
            key={m.key}
            style={[s.modeCard, mode === m.key && { borderColor: m.color, borderWidth: 2 }]}
            onPress={() => setMode(m.key)}
          >
            <View style={[s.modeIcon, { backgroundColor: m.color + '20' }]}>
              <Ionicons name={m.icon as any} size={22} color={m.color} />
            </View>
            <View style={{ flex: 1, marginLeft: sp.md }}>
              <Text style={s.modeLabel}>{m.label}</Text>
              <Text style={s.modeDesc}>{m.desc}</Text>
            </View>
            {mode === m.key && <Ionicons name="checkmark-circle" size={22} color={m.color} />}
          </TouchableOpacity>
        ))}

        {/* Subject Selection (shown for Topic mode) */}
        {mode === 'topic' && (
          <>
            <Text style={s.sectionTitle}>Select Subject</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: sp.md }}>
              {subjects.map((sub) => (
                <TouchableOpacity
                  key={sub.id}
                  style={[s.subjectChip, selectedSubject === sub.id && { backgroundColor: sub.color || C.accent, borderColor: sub.color || C.accent }]}
                  onPress={() => setSelectedSubject(sub.id)}
                >
                  <Text style={[s.subjectChipText, selectedSubject === sub.id && { color: C.white }]}>
                    {sub.code}
                  </Text>
                </TouchableOpacity>
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
                <TouchableOpacity
                  key={n}
                  style={[s.numBtn, numItems === n && s.numBtnActive]}
                  onPress={() => setNumItems(n)}
                >
                  <Text style={[s.numBtnText, numItems === n && s.numBtnTextActive]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
        {mode === 'timed'     && <Text style={s.noticeText}>Timed mode: 10 questions · 30 seconds each</Text>}
        {mode === 'challenge' && <Text style={s.noticeText}>Challenge mode: 20 hard questions · simulate the board exam</Text>}

        {/* Start Button */}
        <TouchableOpacity style={[s.startBtn, { backgroundColor: currentMode.color }, starting && s.startOff]} onPress={startQuiz} disabled={starting}>
          {starting
            ? <ActivityIndicator color={C.white} />
            : <>
                <Ionicons name="play" size={20} color={C.white} />
                <Text style={s.startText}>Start {currentMode.label} Quiz</Text>
              </>}
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.bg },
  center:        { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  header:        { backgroundColor: C.primary, paddingHorizontal: sp.lg, paddingVertical: sp.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title:         { fontSize: 24, fontWeight: '800', color: C.white },
  histBtn:       { flexDirection: 'row', alignItems: 'center', gap: sp.xs },
  headerLeft:    { flexDirection: 'row', alignItems: 'center' },
  backBtn:       { width: 32, marginRight: sp.xs },
  histText:      { color: C.white, fontSize: 13, fontWeight: '600' },
  sectionTitle:  { fontSize: 14, fontWeight: '700', color: C.muted, letterSpacing: 0.5, marginBottom: sp.sm, marginTop: sp.sm },
  modeCard:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: r.lg, padding: sp.md, marginBottom: sp.sm, borderWidth: 1, borderColor: 'transparent', ...sh.sm },
  modeIcon:      { width: 44, height: 44, borderRadius: r.md, justifyContent: 'center', alignItems: 'center' },
  modeLabel:     { fontSize: 15, fontWeight: '700', color: C.text },
  modeDesc:      { fontSize: 12, color: C.muted, marginTop: 2 },
  subjectChip:   { paddingHorizontal: sp.md, paddingVertical: sp.sm, borderRadius: r.full, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, marginRight: sp.sm },
  subjectChipText:{ fontSize: 13, fontWeight: '700', color: C.text },
  numRow:        { flexDirection: 'row', gap: sp.sm, marginBottom: sp.md },
  numBtn:        { flex: 1, paddingVertical: 10, borderRadius: r.md, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', ...sh.sm },
  numBtnActive:  { backgroundColor: C.accent, borderColor: C.accent },
  numBtnText:    { fontSize: 16, fontWeight: '700', color: C.muted },
  numBtnTextActive:{ color: C.white },
  noticeText:    { fontSize: 13, color: C.muted, textAlign: 'center', marginVertical: sp.sm, fontStyle: 'italic' },
  startBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: r.lg, gap: sp.sm, marginTop: sp.md },
  startOff:      { opacity: 0.7 },
  startText:     { color: C.white, fontSize: 17, fontWeight: '800' },
});
