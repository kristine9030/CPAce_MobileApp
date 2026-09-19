import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, ScrollView, ActivityIndicator,
  RefreshControl, Alert, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client from '@/lib/api/client';
import { C, sp, r, sh, font, grad } from '@/constants/cpace-theme';
import { ScreenHeader } from '@/components/ui/screen-header';
import { GradientButton, GradientFill } from '@/components/ui/gradient';
import { useAiTutor } from '@/lib/context/ai-tutor-context';

interface Note {
  id: number;
  title: string;
  content: string;
  subject_id: number | null;
  subject_code: string | null;
  is_favorite: boolean;
  is_archived: boolean;
  is_trashed: boolean;
  created_on: string;   // formatted string from API e.g. "Jun 28, 2026"
}

type FormNote = { title: string; content: string };
type View_ = 'active' | 'archived' | 'trash';

const VIEWS = [
  { key: 'active'   as const, label: 'Notes',    icon: 'documents-outline' as const },
  { key: 'archived' as const, label: 'Archived', icon: 'archive-outline' as const },
  { key: 'trash'    as const, label: 'Trash',    icon: 'trash-outline' as const },
];

export default function NotesScreen() {
  const router      = useRouter();
  const { askAI } = useAiTutor();
  const [notes, setNotes]         = useState<Note[]>([]);
  const [filtered, setFiltered]   = useState<Note[]>([]);
  const [search, setSearch]       = useState('');
  const [loading, setLoading]     = useState(true);
  const [refresh, setRefresh]     = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState<Note | null>(null);
  const [form, setForm]           = useState<FormNote>({ title: '', content: '' });
  const [saving, setSaving]       = useState(false);
  const [favOnly, setFavOnly]     = useState(false);
  const [viewing, setViewing]     = useState<Note | null>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [view, setView]           = useState<View_>('active');
  const [counts, setCounts]       = useState({ active: 0, archived: 0, trash: 0 });

  const selectedText = viewing ? (viewing.content ?? '').slice(selection.start, selection.end).trim() : '';

  const askAboutSelection = () => {
    if (!selectedText) return;
    askAI(`Please explain this from my CPA review notes and give the rationale behind it:\n\n"${selectedText}"`);
    setViewing(null);
    setSelection({ start: 0, end: 0 });
  };

  const searchSelectionOnline = () => {
    if (!selectedText) return;
    Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(selectedText)}`);
  };

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefresh(true);
    try {
      const res = await client.get('/review-notes', { params: { view } });
      const list = res.data.data ?? [];
      setNotes(list);
      if (res.data.counts) setCounts(res.data.counts);
      applyFilter(list, search, favOnly);
    } catch {}
    setLoading(false);
    setRefresh(false);
  }, [search, favOnly, view]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const applyFilter = (list: Note[], q: string, fav: boolean) => {
    let r = list;
    if (fav) r = r.filter(n => n.is_favorite);
    if (q) {
      const needle = q.toLowerCase();
      r = r.filter(n =>
        (n.title ?? '').toLowerCase().includes(needle) ||
        (n.content ?? '').toLowerCase().includes(needle));
    }
    setFiltered(r);
  };

  const onSearch = (text: string) => {
    setSearch(text);
    applyFilter(notes, text, favOnly);
  };

  const toggleFav = () => {
    const next = !favOnly;
    setFavOnly(next);
    applyFilter(notes, search, next);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', content: '' });
    setShowForm(true);
  };

  const openEdit = (note: Note) => {
    setEditing(note);
    setForm({ title: note.title, content: note.content });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.title.trim()) { Alert.alert('Required', 'Please add a title.'); return; }
    setSaving(true);
    try {
      if (editing) {
        await client.put(`/review-notes/${editing.id}`, form);
      } else {
        await client.post('/review-notes', form);
      }
      setShowForm(false);
      load();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not save note.');
    } finally {
      setSaving(false);
    }
  };

  // In the main/archived views this moves the note to Trash; from Trash it is
  // a permanent delete, so the wording changes with it.
  const del = (id: number) => {
    const permanent = view === 'trash';
    Alert.alert(
      permanent ? 'Delete Forever' : 'Move to Trash',
      permanent
        ? 'This note will be gone for good. This cannot be undone.'
        : 'You can restore it from Trash later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: permanent ? 'Delete Forever' : 'Move to Trash',
          style: 'destructive',
          onPress: async () => {
            try {
              await client.delete(`/review-notes/${id}${permanent ? '?force=1' : ''}`);
              load();
            } catch {}
          },
        },
      ],
    );
  };

  const toggleArchive = async (note: Note) => {
    try {
      await client.post(`/review-notes/${note.id}/archive`);
      load();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not update this note.');
    }
  };

  const restore = async (note: Note) => {
    try {
      await client.post(`/review-notes/${note.id}/restore`);
      load();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not restore this note.');
    }
  };

  const openQuiz = (note: Note) => {
    router.push({
      pathname: '/note-quiz',
      params: { noteId: String(note.id), noteTitle: note.title },
    });
  };

  const switchView = (next: View_) => {
    if (next === view) return;
    setView(next);
    setLoading(true);
  };

  const toggleNoteFav = async (note: Note) => {
    try {
      await client.post(`/review-notes/${note.id}/favorite`);
      const updated = notes.map(n => n.id === note.id ? { ...n, is_favorite: !n.is_favorite } : n);
      setNotes(updated);
      applyFilter(updated, search, favOnly);
    } catch {}
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={C.accent} /></View>;
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader
        title="Review Notes"
        subtitle={`${counts.active} note${counts.active === 1 ? '' : 's'}`}
        onBack={() => router.push('/(tabs)')}
        right={
          <GradientButton radius={20} contentStyle={s.addBtn} onPress={openCreate}>
            <Ionicons name="add" size={24} color={C.white} />
          </GradientButton>
        }
      />

      {/* Active / Archived / Trash */}
      <View style={s.viewTabs}>
        {VIEWS.map((v) => {
          const active = v.key === view;
          const count = counts[v.key];
          return (
            <TouchableOpacity
              key={v.key}
              style={[s.viewTab, active && s.viewTabActive]}
              onPress={() => switchView(v.key)}
              activeOpacity={0.8}
            >
              <Ionicons name={v.icon} size={15} color={active ? C.primary : C.muted} />
              <Text style={[s.viewTabText, active && s.viewTabTextActive]}>{v.label}</Text>
              {count > 0 ? (
                <View style={[s.viewTabBadge, active && s.viewTabBadgeActive]}>
                  <Text style={[s.viewTabBadgeText, active && { color: C.white }]}>{count}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Search + Filter */}
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Ionicons name="search" size={16} color={C.muted} style={{ marginRight: sp.xs }} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={onSearch}
            placeholder="Search notes…"
            placeholderTextColor={C.light}
          />
        </View>
        {favOnly ? (
          <GradientButton radius={r.md} contentStyle={s.favToggleActive} onPress={toggleFav}>
            <Ionicons name="star" size={18} color={C.white} />
          </GradientButton>
        ) : (
          <TouchableOpacity style={s.favToggle} onPress={toggleFav}>
            <Ionicons name="star-outline" size={18} color={C.muted} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: sp.md }}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => load(true)} tintColor={C.accent} />}
        renderItem={({ item }) => (
          <TouchableOpacity style={[s.cardWrap]} activeOpacity={0.8} onPress={() => setViewing(item)}>
            <View style={s.card}>
              <View style={s.cardTop}>
                <Text style={s.noteTile} numberOfLines={1}>{item.title}</Text>
                <TouchableOpacity onPress={() => toggleNoteFav(item)}>
                  <Ionicons name={item.is_favorite ? 'star' : 'star-outline'} size={18} color={item.is_favorite ? C.warning : C.light} />
                </TouchableOpacity>
              </View>
              {item.subject_code && (
                <GradientFill colors={grad.brandSoft} style={s.badge}>
                  <Text style={s.badgeText}>{item.subject_code}</Text>
                </GradientFill>
              )}
              <Text style={s.content} numberOfLines={3}>{item.content}</Text>
              <Text style={s.date}>{item.created_on ?? ''}</Text>
              <View style={s.actions}>
                {view === 'trash' ? (
                  <>
                    <TouchableOpacity style={s.actionBtn} onPress={() => restore(item)}>
                      <Ionicons name="arrow-undo" size={16} color={C.success} />
                      <Text style={[s.actionText, { color: C.success }]}>Restore</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.actionBtn} onPress={() => del(item.id)}>
                      <Ionicons name="trash" size={16} color={C.danger} />
                      <Text style={[s.actionText, { color: C.danger }]}>Delete Forever</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity style={s.actionBtn} onPress={() => openQuiz(item)}>
                      <Ionicons name="sparkles" size={16} color={C.purple} />
                      <Text style={[s.actionText, { color: C.purple }]}>Quiz Me</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.actionBtn} onPress={() => openEdit(item)}>
                      <Ionicons name="pencil" size={16} color={C.accent} />
                      <Text style={[s.actionText, { color: C.accent }]}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.actionBtn} onPress={() => toggleArchive(item)}>
                      <Ionicons
                        name={item.is_archived ? 'arrow-undo' : 'archive'}
                        size={16}
                        color={C.muted}
                      />
                      <Text style={[s.actionText, { color: C.muted }]}>
                        {item.is_archived ? 'Unarchive' : 'Archive'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.actionBtn} onPress={() => del(item.id)}>
                      <Ionicons name="trash" size={16} color={C.danger} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={s.emptyBox}>
            <Ionicons
              name={view === 'trash' ? 'trash-outline' : view === 'archived' ? 'archive-outline' : 'document-text-outline'}
              size={48}
              color={C.light}
            />
            <Text style={s.emptyText}>
              {favOnly
                ? 'No starred notes.'
                : view === 'trash'
                  ? 'Trash is empty.'
                  : view === 'archived'
                    ? 'Nothing archived yet.'
                    : 'No notes yet. Tap + to create one.'}
            </Text>
          </View>
        }
      />

      {/* Create / Edit Modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Text style={s.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={s.modalTitle}>{editing ? 'Edit Note' : 'New Note'}</Text>
              <TouchableOpacity onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color={C.accent} /> : <Text style={s.modalSave}>Save</Text>}
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: sp.lg }}>
              <Text style={s.formLabel}>Title</Text>
              <TextInput
                style={s.formInput}
                value={form.title}
                onChangeText={(t) => setForm(f => ({ ...f, title: t }))}
                placeholder="Note title"
                placeholderTextColor={C.light}
              />
              <Text style={s.formLabel}>Content</Text>
              <TextInput
                style={[s.formInput, s.formTextarea]}
                value={form.content}
                onChangeText={(t) => setForm(f => ({ ...f, content: t }))}
                placeholder="Write your notes here…"
                placeholderTextColor={C.light}
                multiline
                textAlignVertical="top"
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* View Note — highlight text to ask AI or search online */}
      <Modal
        visible={!!viewing}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setViewing(null); setSelection({ start: 0, end: 0 }); }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => { setViewing(null); setSelection({ start: 0, end: 0 }); }}>
              <Text style={s.modalCancel}>Close</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle} numberOfLines={1}>{viewing?.title}</Text>
            <View style={{ width: 44 }} />
          </View>
          <Text style={s.viewHint}>Highlight text below to ask AI or search it online.</Text>
          <ScrollView contentContainerStyle={{ padding: sp.lg }} keyboardShouldPersistTaps="handled">
            <TextInput
              style={s.viewContent}
              value={viewing?.content ?? ''}
              editable={false}
              multiline
              selection={selection}
              onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
            />
          </ScrollView>
          {selectedText.length > 0 && (
            <View style={[s.selectionBar, sh.md]}>
              <GradientButton
                radius={r.md}
                style={{ flex: 1 }}
                contentStyle={s.selectionBtn}
                onPress={askAboutSelection}
              >
                <Ionicons name="sparkles" size={16} color={C.white} />
                <Text style={s.selectionBtnText}>Ask AI</Text>
              </GradientButton>
              <TouchableOpacity style={[s.selectionBtn, s.selectionBtnAlt]} onPress={searchSelectionOnline}>
                <Ionicons name="search" size={16} color={C.white} />
                <Text style={s.selectionBtnText}>Search</Text>
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}


const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: C.bg },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  addBtn:       { width: 40, height: 40, paddingVertical: 0, paddingHorizontal: 0 },
  viewTabs:     { flexDirection: 'row', gap: sp.xs, paddingHorizontal: sp.md, paddingTop: sp.xs },
  viewTab:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: r.md, backgroundColor: 'rgba(255,255,255,0.78)', borderWidth: 1, borderColor: C.border },
  viewTabActive:{ borderColor: C.primary, backgroundColor: 'rgba(123,20,22,0.07)' },
  viewTabText:  { fontSize: 12.5, fontFamily: font.semiBold, color: C.muted },
  viewTabTextActive: { color: C.primary },
  viewTabBadge: { minWidth: 18, paddingHorizontal: 5, paddingVertical: 1, borderRadius: r.full, backgroundColor: C.border, alignItems: 'center' },
  viewTabBadgeActive: { backgroundColor: C.primary },
  viewTabBadgeText: { fontSize: 10, fontFamily: font.bold, color: C.muted },
  searchRow:    { flexDirection: 'row', padding: sp.md, gap: sp.sm },
  searchBox:    { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.md, paddingHorizontal: sp.sm, borderWidth: 1, borderColor: C.border },
  searchInput:  { flex: 1, paddingVertical: 10, fontSize: 14, fontFamily: font.regular, color: C.text },
  favToggle:    { width: 44, height: 44, borderRadius: r.md, backgroundColor: 'rgba(255,255,255,0.78)', borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  favToggleActive: { width: 44, height: 44, paddingVertical: 0, paddingHorizontal: 0 },
  cardWrap:     { borderRadius: r.lg, marginBottom: sp.sm, overflow: 'hidden', },
  card:         { backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.lg, padding: sp.md, overflow: 'hidden' },
  cardTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  noteTile:     { flex: 1, fontSize: 15, fontFamily: font.bold, color: C.text, marginRight: sp.sm },
  badge:        { alignSelf: 'flex-start', paddingHorizontal: sp.sm, paddingVertical: 3, borderRadius: r.sm, marginTop: sp.xs, overflow: 'hidden' },
  badgeText:    { fontSize: 11, fontFamily: font.bold, color: C.white },
  content:      { fontSize: 14, fontFamily: font.regular, color: C.muted, marginTop: sp.xs, lineHeight: 20 },
  date:         { fontSize: 11, fontFamily: font.regular, color: C.light, marginTop: sp.xs },
  actions:      { flexDirection: 'row', flexWrap: 'wrap', gap: sp.md, marginTop: sp.sm, borderTopWidth: 1, borderTopColor: C.border, paddingTop: sp.sm },
  actionBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText:   { fontSize: 13, fontFamily: font.semiBold },
  emptyBox:     { alignItems: 'center', paddingTop: 60, gap: sp.md },
  emptyText:    { fontSize: 14, fontFamily: font.regular, color: C.muted, textAlign: 'center' },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: sp.lg, borderBottomWidth: 1, borderBottomColor: C.border },
  modalCancel:  { fontSize: 16, fontFamily: font.regular, color: C.muted },
  modalTitle:   { fontSize: 17, fontFamily: font.bold, color: C.text },
  modalSave:    { fontSize: 16, fontFamily: font.bold, color: C.accent },
  formLabel:    { fontSize: 13, fontFamily: font.semiBold, color: C.muted, marginBottom: 6, marginTop: sp.sm },
  formInput:    { backgroundColor: C.card, borderRadius: r.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: sp.md, paddingVertical: 12, fontSize: 15, fontFamily: font.regular, color: C.text },
  formTextarea: { height: 200, paddingTop: 12 },
  viewHint:     { fontSize: 12, fontFamily: font.regular, color: C.muted, paddingHorizontal: sp.lg, paddingTop: sp.sm, fontStyle: 'italic' },
  viewContent:  { fontSize: 15, fontFamily: font.regular, color: C.text, lineHeight: 22 },
  selectionBar: {
    position: 'absolute', bottom: 24, left: sp.lg, right: sp.lg,
    flexDirection: 'row', gap: sp.sm, backgroundColor: '#1f2937',
    borderRadius: r.lg, padding: sp.sm,
  },
  selectionBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: r.md, paddingVertical: 10 },
  selectionBtnAlt:  { backgroundColor: '#374151' },
  selectionBtnText: { color: C.white, fontSize: 13, fontFamily: font.bold },
});
