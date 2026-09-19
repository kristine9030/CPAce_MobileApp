import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, RefreshControl, Linking, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client from '@/lib/api/client';
import { C, sp, r, font } from '@/constants/cpace-theme';
import { ScreenHeader } from '@/components/ui/screen-header';
import { GradientButton } from '@/components/ui/gradient';

interface Resource {
  id: number;
  title: string;
  description: string | null;
  original_name: string;
  file_category: string;
  human_size: string | null;
  downloads_count: number;
  subject_code: string | null;
  uploader_name: string;
  uploader_role: string | null;
  created_on: string;
  url: string | null;
}

function fileIcon(category: string) {
  switch (category) {
    case 'pdf':        return { name: 'document-text' as const, color: '#d64545' };
    case 'word':       return { name: 'document' as const,      color: '#2b579a' };
    case 'excel':      return { name: 'grid' as const,          color: '#217346' };
    case 'powerpoint': return { name: 'easel' as const,         color: '#d24726' };
    case 'image':      return { name: 'image' as const,         color: C.purple };
    case 'video':      return { name: 'videocam' as const,      color: C.warning };
    case 'archive':    return { name: 'archive' as const,       color: C.muted };
    default:           return { name: 'document-attach' as const, color: C.muted };
  }
}

const SORTS = [
  { key: 'recent',  label: 'Recent',       icon: 'time-outline' as const },
  { key: 'popular', label: 'Most saved',   icon: 'trending-up' as const },
] as const;

export default function CommunityResourcesScreen() {
  const router = useRouter();

  const [resources, setResources] = useState<Resource[]>([]);
  const [search, setSearch]       = useState('');
  const [sort, setSort]           = useState<'recent' | 'popular'>('recent');
  const [loading, setLoading]     = useState(true);
  const [refresh, setRefresh]     = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefresh(true);
    try {
      const res = await client.get('/community/resources', {
        params: { sort, search: search.trim() || undefined },
      });
      setResources(res.data.resources ?? []);
    } catch {}
    setLoading(false);
    setRefresh(false);
  }, [sort, search]);

  // One debounced fetch covers both the initial load and every change to the
  // search term or sort, so switching tabs never fires two requests at once.
  useEffect(() => {
    const id = setTimeout(() => { load(); }, search ? 350 : 0);
    return () => clearTimeout(id);
  }, [search, sort]);

  const download = async (resource: Resource) => {
    if (!resource.url) {
      Alert.alert('Unavailable', 'This file is no longer available.');
      return;
    }

    // Record the download first so the library's popularity ranking stays
    // honest, then hand the file to the browser.
    try {
      await client.post(`/community/resources/${resource.id}/download`);
      setResources((prev) => prev.map((r2) => (
        r2.id === resource.id ? { ...r2, downloads_count: r2.downloads_count + 1 } : r2
      )));
    } catch {}

    Linking.openURL(resource.url).catch(() => {
      Alert.alert('Error', 'Could not open this file.');
    });
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={C.accent} /></View>;
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader
        title="Resource Library"
        subtitle="Study materials shared by alumni"
        onBack={() => router.back()}
      />

      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Ionicons name="search" size={16} color={C.muted} style={{ marginRight: sp.xs }} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search materials…"
            placeholderTextColor={C.light}
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={C.light} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={s.sortRow}>
        {SORTS.map((option) => (
          option.key === sort ? (
            <GradientButton
              key={option.key}
              radius={r.full}
              contentStyle={s.sortChipActive}
              onPress={() => setSort(option.key)}
            >
              <Ionicons name={option.icon} size={14} color={C.white} />
              <Text style={[s.sortText, { color: C.white }]}>{option.label}</Text>
            </GradientButton>
          ) : (
            <TouchableOpacity
              key={option.key}
              style={s.sortChip}
              onPress={() => setSort(option.key)}
            >
              <Ionicons name={option.icon} size={14} color={C.muted} />
              <Text style={s.sortText}>{option.label}</Text>
            </TouchableOpacity>
          )
        ))}
      </View>

      <FlatList
        data={resources}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: sp.md, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => load(true)} tintColor={C.accent} />}
        renderItem={({ item }) => {
          const icon = fileIcon(item.file_category);
          return (
            <TouchableOpacity
              style={s.card}
              activeOpacity={0.8}
              onPress={() => download(item)}
            >
              <View style={[s.iconBox, { backgroundColor: icon.color + '18' }]}>
                <Ionicons name={icon.name} size={22} color={icon.color} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={s.title} numberOfLines={2}>{item.title}</Text>
                {item.description ? (
                  <Text style={s.desc} numberOfLines={2}>{item.description}</Text>
                ) : null}

                <View style={s.metaRow}>
                  {item.subject_code ? (
                    <View style={s.chip}>
                      <Text style={s.chipText}>{item.subject_code}</Text>
                    </View>
                  ) : null}
                  {item.human_size ? <Text style={s.meta}>{item.human_size}</Text> : null}
                  <View style={s.meta2}>
                    <Ionicons name="download-outline" size={12} color={C.muted} />
                    <Text style={s.meta}>{item.downloads_count}</Text>
                  </View>
                </View>

                <Text style={s.uploader} numberOfLines={1}>
                  {item.uploader_name}{item.uploader_role ? ` · ${item.uploader_role}` : ''} · {item.created_on}
                </Text>
              </View>

              <Ionicons name="download-outline" size={20} color={C.accent} />
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={s.emptyBox}>
            <Ionicons name="folder-open-outline" size={48} color={C.light} />
            <Text style={s.emptyText}>
              {search
                ? `No materials match “${search}”.`
                : 'No materials shared yet.\nAlumni uploads will appear here.'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: C.bg },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  searchRow:  { paddingHorizontal: sp.md, paddingTop: sp.sm },
  searchBox:  { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.md, paddingHorizontal: sp.sm, borderWidth: 1, borderColor: C.border },
  searchInput:{ flex: 1, paddingVertical: 10, fontSize: 14, fontFamily: font.regular, color: C.text },
  sortRow:    { flexDirection: 'row', gap: sp.sm, paddingHorizontal: sp.md, paddingTop: sp.sm },
  sortChip:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: sp.md, paddingVertical: 7, borderRadius: r.full, backgroundColor: 'rgba(255,255,255,0.78)', borderWidth: 1, borderColor: C.border },
  sortChipActive: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: sp.md, paddingVertical: 8 },
  sortText:   { fontSize: 12.5, fontFamily: font.semiBold, color: C.muted },
  card:       { flexDirection: 'row', alignItems: 'center', gap: sp.sm, backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.lg, padding: sp.md, marginBottom: sp.sm, borderWidth: 1, borderColor: C.border },
  iconBox:    { width: 44, height: 44, borderRadius: r.md, justifyContent: 'center', alignItems: 'center' },
  title:      { fontSize: 14.5, fontFamily: font.bold, color: C.text, lineHeight: 20 },
  desc:       { fontSize: 12.5, fontFamily: font.regular, color: C.muted, marginTop: 2, lineHeight: 18 },
  metaRow:    { flexDirection: 'row', alignItems: 'center', gap: sp.sm, marginTop: 6, flexWrap: 'wrap' },
  chip:       { paddingHorizontal: sp.sm, paddingVertical: 2, borderRadius: r.sm, backgroundColor: 'rgba(123,20,22,0.08)' },
  chipText:   { fontSize: 10.5, fontFamily: font.bold, color: C.primary },
  meta:       { fontSize: 11.5, fontFamily: font.regular, color: C.muted },
  meta2:      { flexDirection: 'row', alignItems: 'center', gap: 3 },
  uploader:   { fontSize: 11, fontFamily: font.regular, color: C.light, marginTop: 4 },
  emptyBox:   { alignItems: 'center', paddingTop: 60, gap: sp.md },
  emptyText:  { fontSize: 14, fontFamily: font.regular, color: C.muted, textAlign: 'center', lineHeight: 21 },
});
