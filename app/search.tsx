import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity,
  TextInput, ActivityIndicator, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client from '@/lib/api/client';
import { C, sp, r, font } from '@/constants/cpace-theme';
import { ScreenHeader } from '@/components/ui/screen-header';
import { GradientFill } from '@/components/ui/gradient';

interface Hit {
  id: number;
  title: string;
  subtitle: string;
  route: string;
  params: Record<string, string>;
}

interface Group {
  key: string;
  label: string;
  icon: string;
  items: Hit[];
}

const MIN_CHARS = 2;

const SUGGESTIONS = [
  { label: 'Class Quizzes',    icon: 'clipboard' as const,     route: '/class-quiz' },
  { label: 'Community',        icon: 'people' as const,        route: '/community' },
  { label: 'Resource Library', icon: 'folder-open' as const,   route: '/community/resources' },
  { label: 'My Notes',         icon: 'document-text' as const, route: '/(tabs)/notes' },
];

export default function SearchScreen() {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  // Seeded when the dashboard's quick search hands off a half-typed term.
  const { q: initialQuery } = useLocalSearchParams<{ q?: string }>();

  const [query, setQuery]     = useState(initialQuery ?? '');
  const [groups, setGroups]   = useState<Group[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Only the newest query's response is allowed to land, so a slow earlier
  // request can't overwrite results for what the student is typing now.
  const seq = useRef(0);

  useEffect(() => {
    const term = query.trim();

    if (term.length < MIN_CHARS) {
      setGroups([]);
      setTotal(0);
      setSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    const mine = ++seq.current;

    const id = setTimeout(async () => {
      try {
        const res = await client.get('/search', { params: { q: term } });
        if (mine !== seq.current) return;
        setGroups(res.data.groups ?? []);
        setTotal(res.data.total ?? 0);
      } catch {
        if (mine !== seq.current) return;
        setGroups([]);
        setTotal(0);
      } finally {
        if (mine === seq.current) {
          setLoading(false);
          setSearched(true);
        }
      }
    }, 320);

    return () => clearTimeout(id);
  }, [query]);

  const open = (hit: Hit) => {
    Keyboard.dismiss();
    router.push({ pathname: hit.route as any, params: hit.params });
  };

  const sections = groups.map((g) => ({ ...g, data: g.items }));

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title="Search" onBack={() => router.back()} />

      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Ionicons name="search" size={17} color={C.muted} style={{ marginRight: sp.xs }} />
          <TextInput
            ref={inputRef}
            style={s.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search subjects, notes, quizzes…"
            placeholderTextColor={C.light}
            autoFocus
            returnKeyType="search"
            autoCorrect={false}
          />
          {loading ? (
            <ActivityIndicator size="small" color={C.accent} />
          ) : query.length > 0 ? (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={C.light} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {query.trim().length < MIN_CHARS ? (
        <View style={s.idle}>
          <Text style={s.idleHint}>Type at least {MIN_CHARS} characters to search.</Text>

          <Text style={s.idleTitle}>Jump to</Text>
          <View style={s.suggestWrap}>
            {SUGGESTIONS.map((item) => (
              <TouchableOpacity
                key={item.label}
                style={s.suggest}
                onPress={() => router.push(item.route as any)}
              >
                <GradientFill style={s.suggestIcon}>
                  <Ionicons name={item.icon} size={17} color={C.white} />
                </GradientFill>
                <Text style={s.suggestLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => `${item.route}-${item.id}-${index}`}
          contentContainerStyle={{ padding: sp.md, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={s.sectionHead}>
              <Ionicons name={section.icon as any} size={14} color={C.accent} />
              <Text style={s.sectionTitle}>{section.label}</Text>
              <Text style={s.sectionCount}>{section.items.length}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.row} activeOpacity={0.75} onPress={() => open(item)}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle} numberOfLines={2}>{item.title}</Text>
                {item.subtitle ? (
                  <Text style={s.rowSub} numberOfLines={1}>{item.subtitle}</Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.light} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            !loading && searched ? (
              <View style={s.emptyBox}>
                <Ionicons name="search-outline" size={44} color={C.light} />
                <Text style={s.emptyText}>
                  Nothing found for “{query.trim()}”.{'\n'}Try a different word.
                </Text>
              </View>
            ) : null
          }
          ListHeaderComponent={
            searched && total > 0 ? (
              <Text style={s.resultCount}>
                {total} result{total === 1 ? '' : 's'}
              </Text>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: C.bg },
  searchRow:   { paddingHorizontal: sp.md, paddingTop: sp.xs, paddingBottom: sp.sm },
  searchBox:   { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.md, paddingHorizontal: sp.md, borderWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 15, fontFamily: font.regular, color: C.text },
  idle:        { padding: sp.md },
  idleHint:    { fontSize: 13, fontFamily: font.regular, color: C.muted, textAlign: 'center', marginVertical: sp.md, fontStyle: 'italic' },
  idleTitle:   { fontSize: 15, fontFamily: font.bold, color: C.text, marginBottom: sp.sm, marginTop: sp.sm },
  suggestWrap: { gap: sp.sm },
  suggest:     { flexDirection: 'row', alignItems: 'center', gap: sp.sm, backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.lg, padding: sp.md, borderWidth: 1, borderColor: C.border },
  suggestIcon: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  suggestLabel:{ fontSize: 14, fontFamily: font.semiBold, color: C.text },
  resultCount: { fontSize: 12, fontFamily: font.medium, color: C.muted, marginBottom: sp.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: sp.md, marginBottom: sp.xs },
  sectionTitle:{ flex: 1, fontSize: 13, fontFamily: font.bold, color: C.text, textTransform: 'uppercase', letterSpacing: 0.4 },
  sectionCount:{ fontSize: 11, fontFamily: font.bold, color: C.muted, backgroundColor: C.border, paddingHorizontal: 7, paddingVertical: 2, borderRadius: r.full, overflow: 'hidden' },
  row:         { flexDirection: 'row', alignItems: 'center', gap: sp.sm, backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.md, paddingHorizontal: sp.md, paddingVertical: 11, marginBottom: 6, borderWidth: 1, borderColor: C.border },
  rowTitle:    { fontSize: 14, fontFamily: font.semiBold, color: C.text, lineHeight: 20 },
  rowSub:      { fontSize: 12, fontFamily: font.regular, color: C.muted, marginTop: 1 },
  emptyBox:    { alignItems: 'center', paddingTop: 50, gap: sp.md },
  emptyText:   { fontSize: 14, fontFamily: font.regular, color: C.muted, textAlign: 'center', lineHeight: 21 },
});
