import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, ScrollView, ActivityIndicator,
  RefreshControl, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client from '@/lib/api/client';
import { C, sp, r, sh } from '@/constants/cpace-theme';

interface Note {
  id: number;
  title: string;
  content: string;
  subject_id: number | null;
  subject_code: string | null;
  is_favorite: boolean;
  created_on: string;   // formatted string from API e.g. "Jun 28, 2026"
}

type FormNote = { title: string; content: string };

export default function NotesScreen() {
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

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefresh(true);
    try {
      const res = await client.get('/review-notes');
      const list = res.data.data ?? [];
      setNotes(list);
      applyFilter(list, search, favOnly);
    } catch {}
    setLoading(false);
    setRefresh(false);
  }, [search, favOnly]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const applyFilter = (list: Note[], q: string, fav: boolean) => {
    let r = list;
    if (fav) r = r.filter(n => n.is_favorite);
    if (q) r = r.filter(n => n.title.toLowerCase().includes(q.toLowerCase()) || n.content.toLowerCase().includes(q.toLowerCase()));
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

  const del = (id: number) => {
    Alert.alert('Delete Note', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await client.delete(`/review-notes/${id}`);
          load();
        } catch {}
      }},
    ]);
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
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View>
          <Text style={s.title}>Review Notes</Text>
          <Text style={s.sub}>{notes.length} notes</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openCreate}>
          <Ionicons name="add" size={24} color={C.white} />
        </TouchableOpacity>
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
        <TouchableOpacity style={[s.favToggle, favOnly && { backgroundColor: C.warning }]} onPress={toggleFav}>
          <Ionicons name={favOnly ? 'star' : 'star-outline'} size={18} color={favOnly ? C.white : C.muted} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: sp.md }}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => load(true)} tintColor={C.accent} />}
        renderItem={({ item }) => (
          <View style={[s.card, sh.sm]}>
            <View style={s.cardTop}>
              <Text style={s.noteTile} numberOfLines={1}>{item.title}</Text>
              <TouchableOpacity onPress={() => toggleNoteFav(item)}>
                <Ionicons name={item.is_favorite ? 'star' : 'star-outline'} size={18} color={item.is_favorite ? C.warning : C.light} />
              </TouchableOpacity>
            </View>
            {item.subject_code && (
              <View style={s.badge}><Text style={s.badgeText}>{item.subject_code}</Text></View>
            )}
            <Text style={s.content} numberOfLines={3}>{item.content}</Text>
            <Text style={s.date}>{item.created_on ?? ''}</Text>
            <View style={s.actions}>
              <TouchableOpacity style={s.actionBtn} onPress={() => openEdit(item)}>
                <Ionicons name="pencil" size={16} color={C.accent} />
                <Text style={[s.actionText, { color: C.accent }]}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.actionBtn} onPress={() => del(item.id)}>
                <Ionicons name="trash" size={16} color={C.danger} />
                <Text style={[s.actionText, { color: C.danger }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={s.emptyBox}>
            <Ionicons name="document-text-outline" size={48} color={C.light} />
            <Text style={s.emptyText}>{favOnly ? 'No starred notes.' : 'No notes yet. Tap + to create one.'}</Text>
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
    </SafeAreaView>
  );
}


const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: C.bg },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  header:       { backgroundColor: C.primary, paddingHorizontal: sp.lg, paddingVertical: sp.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title:        { fontSize: 24, fontWeight: '800', color: C.white },
  sub:          { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  addBtn:       { width: 40, height: 40, borderRadius: 20, backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center' },
  searchRow:    { flexDirection: 'row', padding: sp.md, gap: sp.sm },
  searchBox:    { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: r.md, paddingHorizontal: sp.sm, borderWidth: 1, borderColor: C.border },
  searchInput:  { flex: 1, paddingVertical: 10, fontSize: 14, color: C.text },
  favToggle:    { width: 44, height: 44, borderRadius: r.md, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  card:         { backgroundColor: C.card, borderRadius: r.lg, padding: sp.md, marginBottom: sp.sm },
  cardTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  noteTile:     { flex: 1, fontSize: 15, fontWeight: '700', color: C.text, marginRight: sp.sm },
  badge:        { alignSelf: 'flex-start', backgroundColor: C.accent + '20', paddingHorizontal: sp.sm, paddingVertical: 2, borderRadius: r.sm, marginTop: sp.xs },
  badgeText:    { fontSize: 11, fontWeight: '700', color: C.accent },
  content:      { fontSize: 14, color: C.muted, marginTop: sp.xs, lineHeight: 20 },
  date:         { fontSize: 11, color: C.light, marginTop: sp.xs },
  actions:      { flexDirection: 'row', gap: sp.md, marginTop: sp.sm, borderTopWidth: 1, borderTopColor: C.border, paddingTop: sp.xs },
  actionBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText:   { fontSize: 13, fontWeight: '600' },
  emptyBox:     { alignItems: 'center', paddingTop: 60, gap: sp.md },
  emptyText:    { fontSize: 14, color: C.muted, textAlign: 'center' },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: sp.lg, borderBottomWidth: 1, borderBottomColor: C.border },
  modalCancel:  { fontSize: 16, color: C.muted },
  modalTitle:   { fontSize: 17, fontWeight: '700', color: C.text },
  modalSave:    { fontSize: 16, fontWeight: '700', color: C.accent },
  formLabel:    { fontSize: 13, fontWeight: '600', color: C.muted, marginBottom: 6, marginTop: sp.sm },
  formInput:    { backgroundColor: C.card, borderRadius: r.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: sp.md, paddingVertical: 12, fontSize: 15, color: C.text },
  formTextarea: { height: 200, paddingTop: 12 },
});
