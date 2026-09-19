import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client from '@/lib/api/client';
import { C, sp, r, font, grad } from '@/constants/cpace-theme';
import { ScreenHeader } from '@/components/ui/screen-header';
import { GradientButton, GradientFill } from '@/components/ui/gradient';

interface Choice { label: string; text: string; is_correct: boolean }
interface Question {
  question_text: string;
  choices: Choice[];
  explanation: string | null;
}

const COUNT_OPTIONS = [3, 5, 8, 10] as const;

export default function NoteQuizScreen() {
  const { noteId, noteTitle } = useLocalSearchParams<{ noteId: string; noteTitle?: string }>();
  const router = useRouter();

  const [count, setCount]         = useState<number>(5);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const [current, setCurrent]   = useState(0);
  const [answers, setAnswers]   = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [finished, setFinished] = useState(false);

  const generate = useCallback(async (howMany: number) => {
    setGenerating(true);
    setError(null);
    try {
      const res = await client.post(`/review-notes/${noteId}/quiz`, { count: howMany });
      const list: Question[] = res.data.questions ?? [];
      if (list.length === 0) {
        setError('The AI could not build a quiz from this note. Try adding more detail to it.');
        return;
      }
      setQuestions(list);
      setCurrent(0);
      setAnswers({});
      setRevealed({});
      setFinished(false);
    } catch (err: any) {
      setError(err.message || 'Could not build a quiz right now.');
    } finally {
      setGenerating(false);
    }
  }, [noteId]);

  const select = (index: number, label: string) => {
    if (revealed[index]) return;
    setAnswers((prev) => ({ ...prev, [index]: label }));
    setRevealed((prev) => ({ ...prev, [index]: true }));
  };

  const correctCount = questions.reduce((sum, q, i) => {
    const picked = answers[i];
    const right = q.choices.find((c) => c.is_correct)?.label;
    return sum + (picked && picked === right ? 1 : 0);
  }, 0);

  // ── Setup / error state ───────────────────────────────────────────────────
  if (questions.length === 0) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <ScreenHeader
          title="Quiz from Note"
          subtitle={noteTitle || undefined}
          onBack={() => router.back()}
        />

        <ScrollView contentContainerStyle={{ padding: sp.md }}>
          <View style={s.introCard}>
            <GradientFill style={s.introIcon}>
              <Ionicons name="sparkles" size={24} color={C.white} />
            </GradientFill>
            <Text style={s.introTitle}>Test what stuck</Text>
            <Text style={s.introBody}>
              CPAce builds a short practice quiz from this note&apos;s own content — so you find out
              whether what you wrote down actually landed.
            </Text>
          </View>

          {error ? (
            <View style={s.errorCard}>
              <Ionicons name="alert-circle" size={18} color={C.danger} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          <Text style={s.label}>How many questions?</Text>
          <View style={s.countRow}>
            {COUNT_OPTIONS.map((n) => (
              n === count ? (
                <GradientButton
                  key={n}
                  radius={r.md}
                  style={{ flex: 1 }}
                  contentStyle={s.countBtnActive}
                  onPress={() => setCount(n)}
                >
                  <Text style={[s.countText, { color: C.white }]}>{n}</Text>
                </GradientButton>
              ) : (
                <TouchableOpacity key={n} style={s.countBtn} onPress={() => setCount(n)}>
                  <Text style={s.countText}>{n}</Text>
                </TouchableOpacity>
              )
            ))}
          </View>

          <GradientButton
            radius={r.lg}
            style={{ marginTop: sp.lg }}
            contentStyle={s.generateBtn}
            onPress={() => generate(count)}
            loading={generating}
          >
            <Ionicons name="sparkles" size={19} color={C.white} />
            <Text style={s.generateText}>Generate Quiz</Text>
          </GradientButton>

          {generating ? (
            <Text style={s.generatingHint}>Reading your note and writing questions…</Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Results ───────────────────────────────────────────────────────────────
  if (finished) {
    const percent = Math.round((correctCount / questions.length) * 100);
    const passed = percent >= 75;

    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <ScreenHeader title="Quiz Result" subtitle={noteTitle || undefined} onBack={() => router.back()} />

        <ScrollView contentContainerStyle={{ padding: sp.md, paddingBottom: 60 }}>
          <GradientFill colors={passed ? grad.success : grad.brand} style={s.hero}>
            <Text style={s.heroPct}>{percent}%</Text>
            <Text style={s.heroScore}>{correctCount} of {questions.length} correct</Text>
          </GradientFill>

          <Text style={s.reviewTitle}>Review</Text>

          {questions.map((q, i) => {
            const picked = answers[i];
            const right = q.choices.find((c) => c.is_correct)?.label;
            const wasRight = picked === right;

            return (
              <View key={i} style={s.reviewCard}>
                <View style={s.reviewHead}>
                  <View style={[s.numBadge, { backgroundColor: wasRight ? C.success : C.danger }]}>
                    <Text style={s.numBadgeText}>{i + 1}</Text>
                  </View>
                  <Text style={s.reviewQuestion}>{q.question_text}</Text>
                </View>

                {q.choices.map((c) => {
                  const isRight = c.is_correct;
                  const wrongPick = picked === c.label && !isRight;
                  return (
                    <View
                      key={c.label}
                      style={[s.choice, isRight && s.choiceCorrect, wrongPick && s.choiceWrong]}
                    >
                      <Text style={[
                        s.choiceLabel,
                        isRight && { color: C.success },
                        wrongPick && { color: C.danger },
                      ]}>{c.label}</Text>
                      <Text style={s.choiceText}>{c.text}</Text>
                      {isRight ? <Ionicons name="checkmark-circle" size={17} color={C.success} /> : null}
                      {wrongPick ? <Ionicons name="close-circle" size={17} color={C.danger} /> : null}
                    </View>
                  );
                })}

                {q.explanation ? (
                  <View style={s.explain}>
                    <Text style={s.explainTitle}>Why</Text>
                    <Text style={s.explainText}>{q.explanation}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}

          <View style={s.resultActions}>
            <TouchableOpacity
              style={s.againBtn}
              onPress={() => { setQuestions([]); setError(null); }}
            >
              <Ionicons name="refresh" size={17} color={C.accent} />
              <Text style={s.againText}>New Quiz</Text>
            </TouchableOpacity>
            <GradientButton
              radius={r.lg}
              style={{ flex: 1 }}
              contentStyle={s.doneBtn}
              onPress={() => router.back()}
            >
              <Text style={s.doneText}>Back to Notes</Text>
            </GradientButton>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Taking the quiz ───────────────────────────────────────────────────────
  const q = questions[current];
  const isRevealed = revealed[current];
  const picked = answers[current];
  const rightLabel = q.choices.find((c) => c.is_correct)?.label;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="close" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{current + 1} / {questions.length}</Text>
        <Text style={s.headerScore}>{correctCount} ✓</Text>
      </View>

      <View style={s.progressBg}>
        <GradientFill diagonal={false} style={[s.progressFill, { width: `${((current + 1) / questions.length) * 100}%` }]} />
      </View>

      <ScrollView contentContainerStyle={{ padding: sp.lg }}>
        <Text style={s.question}>{q.question_text}</Text>

        {q.choices.map((c) => {
          const selected = picked === c.label;
          const showCorrect = isRevealed && c.is_correct;
          const showWrong = isRevealed && selected && !c.is_correct;

          return (
            <TouchableOpacity
              key={c.label}
              style={[
                s.option,
                selected && !isRevealed && s.optionSelected,
                showCorrect && s.optionCorrect,
                showWrong && s.optionWrong,
              ]}
              activeOpacity={0.8}
              onPress={() => select(current, c.label)}
              disabled={isRevealed}
            >
              <View style={s.optLetter}>
                <Text style={s.optLetterText}>{c.label}</Text>
              </View>
              <Text style={s.optText}>{c.text}</Text>
              {showCorrect ? <Ionicons name="checkmark-circle" size={19} color={C.success} /> : null}
              {showWrong ? <Ionicons name="close-circle" size={19} color={C.danger} /> : null}
            </TouchableOpacity>
          );
        })}

        {isRevealed ? (
          <View style={s.feedback}>
            <Text style={[s.feedbackTitle, { color: picked === rightLabel ? C.success : C.danger }]}>
              {picked === rightLabel ? 'Correct' : `Not quite — the answer is ${rightLabel}`}
            </Text>
            {q.explanation ? <Text style={s.feedbackText}>{q.explanation}</Text> : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={s.bottomNav}>
        <TouchableOpacity
          style={[s.navBtn, current === 0 && s.navBtnDisabled]}
          onPress={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={current === 0}
        >
          <Ionicons name="arrow-back" size={20} color={current === 0 ? C.light : C.text} />
          <Text style={[s.navBtnText, current === 0 && { color: C.light }]}>Prev</Text>
        </TouchableOpacity>

        {current < questions.length - 1 ? (
          <GradientButton
            radius={r.md}
            contentStyle={s.navBtnPrimary}
            onPress={() => setCurrent((c) => c + 1)}
            disabled={!isRevealed}
          >
            <Text style={s.navBtnPrimaryText}>Next</Text>
            <Ionicons name="arrow-forward" size={20} color={C.white} />
          </GradientButton>
        ) : (
          <GradientButton
            radius={r.md}
            colors={grad.success}
            contentStyle={s.navBtnPrimary}
            onPress={() => setFinished(true)}
            disabled={!isRevealed}
          >
            <Text style={s.navBtnPrimaryText}>See Result</Text>
            <Ionicons name="checkmark" size={20} color={C.white} />
          </GradientButton>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.bg },
  introCard:     { alignItems: 'center', gap: sp.sm, backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.lg, padding: sp.lg, borderWidth: 1, borderColor: C.border },
  introIcon:     { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  introTitle:    { fontSize: 17, fontFamily: font.bold, color: C.text },
  introBody:     { fontSize: 13.5, fontFamily: font.regular, color: C.muted, textAlign: 'center', lineHeight: 20 },
  errorCard:     { flexDirection: 'row', alignItems: 'flex-start', gap: sp.sm, backgroundColor: 'rgba(192,57,43,0.07)', borderRadius: r.md, padding: sp.md, marginTop: sp.md, borderWidth: 1, borderColor: 'rgba(192,57,43,0.22)' },
  errorText:     { flex: 1, fontSize: 13, fontFamily: font.medium, color: C.text, lineHeight: 19 },
  label:         { fontSize: 14, fontFamily: font.bold, color: C.text, marginTop: sp.lg, marginBottom: sp.sm },
  countRow:      { flexDirection: 'row', gap: sp.sm },
  countBtn:      { flex: 1, paddingVertical: 11, borderRadius: r.md, backgroundColor: 'rgba(255,255,255,0.78)', borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  countBtnActive:{ paddingVertical: 12 },
  countText:     { fontSize: 16, fontFamily: font.bold, color: C.muted },
  generateBtn:   { paddingVertical: 15, gap: sp.sm },
  generateText:  { color: C.white, fontSize: 16, fontFamily: font.extraBold },
  generatingHint:{ fontSize: 12.5, fontFamily: font.regular, color: C.muted, textAlign: 'center', marginTop: sp.md, fontStyle: 'italic' },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: sp.lg, paddingVertical: sp.md },
  headerTitle:   { fontSize: 15, fontFamily: font.semiBold, color: C.text },
  headerScore:   { fontSize: 13, fontFamily: font.bold, color: C.success },
  progressBg:    { height: 3, backgroundColor: C.border },
  progressFill:  { height: 3 },
  question:      { fontSize: 16, lineHeight: 24, fontFamily: font.semiBold, color: C.text, marginBottom: sp.lg },
  option:        { flexDirection: 'row', alignItems: 'center', gap: sp.sm, backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.lg, padding: sp.md, marginBottom: sp.sm, borderWidth: 1, borderColor: C.border },
  optionSelected:{ borderColor: C.accent, backgroundColor: 'rgba(165,32,32,0.04)' },
  optionCorrect: { borderColor: 'rgba(33,163,102,0.45)', backgroundColor: 'rgba(33,163,102,0.08)' },
  optionWrong:   { borderColor: 'rgba(192,57,43,0.45)', backgroundColor: 'rgba(192,57,43,0.07)' },
  optLetter:     { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  optLetterText: { fontSize: 12.5, fontFamily: font.bold, color: C.muted },
  optText:       { flex: 1, fontSize: 14, fontFamily: font.regular, color: C.text, lineHeight: 20 },
  feedback:      { borderRadius: r.lg, padding: sp.md, backgroundColor: 'rgba(0,0,0,0.03)', borderWidth: 1, borderColor: C.border, marginTop: sp.xs },
  feedbackTitle: { fontSize: 14, fontFamily: font.bold, marginBottom: 4 },
  feedbackText:  { fontSize: 13, fontFamily: font.regular, color: C.muted, lineHeight: 19 },
  bottomNav:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: sp.md, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.card },
  navBtn:        { flexDirection: 'row', alignItems: 'center', gap: sp.xs, paddingHorizontal: sp.md, paddingVertical: 10, borderRadius: r.md, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
  navBtnDisabled:{ opacity: 0.4 },
  navBtnText:    { fontSize: 15, fontFamily: font.semiBold, color: C.text },
  navBtnPrimary: { gap: sp.xs, paddingHorizontal: sp.lg, paddingVertical: 10 },
  navBtnPrimaryText: { fontSize: 15, fontFamily: font.bold, color: C.white },
  hero:          { alignItems: 'center', borderRadius: r.xl, paddingVertical: sp.xl, gap: 4, overflow: 'hidden' },
  heroPct:       { fontSize: 44, fontFamily: font.black, color: C.white },
  heroScore:     { fontSize: 14, fontFamily: font.medium, color: 'rgba(255,255,255,0.9)' },
  reviewTitle:   { fontSize: 15, fontFamily: font.bold, color: C.text, marginTop: sp.lg, marginBottom: sp.sm },
  reviewCard:    { backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.lg, padding: sp.md, marginBottom: sp.sm, borderWidth: 1, borderColor: C.border },
  reviewHead:    { flexDirection: 'row', gap: sp.sm, marginBottom: sp.sm },
  numBadge:      { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  numBadgeText:  { fontSize: 11, fontFamily: font.bold, color: C.white },
  reviewQuestion:{ flex: 1, fontSize: 14.5, fontFamily: font.semiBold, color: C.text, lineHeight: 21 },
  choice:        { flexDirection: 'row', alignItems: 'center', gap: sp.sm, borderRadius: r.md, paddingHorizontal: sp.sm, paddingVertical: 8, marginBottom: 5, borderWidth: 1, borderColor: 'transparent', backgroundColor: 'rgba(0,0,0,0.02)' },
  choiceCorrect: { borderColor: 'rgba(33,163,102,0.35)', backgroundColor: 'rgba(33,163,102,0.08)' },
  choiceWrong:   { borderColor: 'rgba(192,57,43,0.35)', backgroundColor: 'rgba(192,57,43,0.07)' },
  choiceLabel:   { fontSize: 12, fontFamily: font.bold, color: C.muted, width: 16 },
  choiceText:    { flex: 1, fontSize: 13.5, fontFamily: font.regular, color: C.text, lineHeight: 19 },
  explain:       { marginTop: sp.sm, paddingTop: sp.sm, borderTopWidth: 1, borderTopColor: C.border },
  explainTitle:  { fontSize: 12, fontFamily: font.bold, color: C.text, marginBottom: 3 },
  explainText:   { fontSize: 13, fontFamily: font.regular, color: C.muted, lineHeight: 19 },
  resultActions: { flexDirection: 'row', gap: sp.sm, marginTop: sp.lg },
  againBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: sp.md, paddingVertical: 15, borderRadius: r.lg, backgroundColor: C.card, borderWidth: 1, borderColor: C.accent },
  againText:     { fontSize: 14, fontFamily: font.bold, color: C.accent },
  doneBtn:       { paddingVertical: 15 },
  doneText:      { color: C.white, fontSize: 15, fontFamily: font.extraBold },
});
