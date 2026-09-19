import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, Modal, TextInput, KeyboardAvoidingView, Platform,
  Alert, Linking, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client from '@/lib/api/client';
import { C, sp, r, font, grad } from '@/constants/cpace-theme';
import { ScreenHeader } from '@/components/ui/screen-header';
import { GradientButton, GradientFill } from '@/components/ui/gradient';

interface Attachment {
  id: number;
  original_name: string;
  file_category: string;
  human_size: string | null;
  url: string | null;
}

interface Post {
  id: number;
  title: string | null;
  body: string;
  post_type: 'tip' | 'question' | 'resource' | 'discussion';
  is_pinned: boolean;
  subject_code: string | null;
  author_name: string;
  author_role: string | null;
  created_on: string;
  likes_count: number;
  replies_count: number;
  liked_by_me: boolean;
  attachments: Attachment[];
}

interface Comment {
  id: number;
  body: string;
  author_name: string;
  author_role: string | null;
  created_on: string;
  is_mine: boolean;
}

/** Icon for an attachment, picked from the coarse category the API sends. */
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

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

export default function CommunityScreen() {
  const router = useRouter();

  const [posts, setPosts]     = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [page, setPage]       = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  // Comment sheet state
  const [openPost, setOpenPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [draft, setDraft]       = useState('');
  const [posting, setPosting]   = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefresh(true);
    try {
      const res = await client.get('/community', { params: { page: 1 } });
      setPosts(res.data.posts ?? []);
      setPage(res.data.page ?? 1);
      setLastPage(res.data.last_page ?? 1);
    } catch {}
    setLoading(false);
    setRefresh(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadMore = async () => {
    if (loadingMore || page >= lastPage) return;
    setLoadingMore(true);
    try {
      const res = await client.get('/community', { params: { page: page + 1 } });
      setPosts((prev) => [...prev, ...(res.data.posts ?? [])]);
      setPage(res.data.page ?? page + 1);
      setLastPage(res.data.last_page ?? lastPage);
    } catch {}
    setLoadingMore(false);
  };

  // Optimistic like — the count moves immediately, then reconciles with the
  // server's real total (or rolls back if the call failed).
  const toggleLike = async (post: Post) => {
    const optimistic = {
      liked_by_me: !post.liked_by_me,
      likes_count: post.likes_count + (post.liked_by_me ? -1 : 1),
    };
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, ...optimistic } : p)));

    try {
      const res = await client.post(`/community/posts/${post.id}/like`);
      setPosts((prev) => prev.map((p) => (
        p.id === post.id
          ? { ...p, liked_by_me: res.data.liked, likes_count: res.data.likes_count }
          : p
      )));
    } catch {
      setPosts((prev) => prev.map((p) => (
        p.id === post.id
          ? { ...p, liked_by_me: post.liked_by_me, likes_count: post.likes_count }
          : p
      )));
    }
  };

  const openComments = async (post: Post) => {
    setOpenPost(post);
    setComments([]);
    setDraft('');
    setLoadingComments(true);
    try {
      const res = await client.get(`/community/posts/${post.id}/comments`);
      setComments(res.data.comments ?? []);
    } catch {}
    setLoadingComments(false);
  };

  const sendComment = async () => {
    const body = draft.trim();
    if (!body || !openPost) return;

    setPosting(true);
    try {
      const res = await client.post(`/community/posts/${openPost.id}/comments`, { body });
      setComments((prev) => [...prev, res.data.comment]);
      setDraft('');
      setPosts((prev) => prev.map((p) => (
        p.id === openPost.id ? { ...p, replies_count: p.replies_count + 1 } : p
      )));
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not post your comment.');
    } finally {
      setPosting(false);
    }
  };

  const deleteComment = (comment: Comment) => {
    Alert.alert('Delete comment', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await client.delete(`/community/comments/${comment.id}`);
            setComments((prev) => prev.filter((c) => c.id !== comment.id));
            if (openPost) {
              setPosts((prev) => prev.map((p) => (
                p.id === openPost.id ? { ...p, replies_count: Math.max(0, p.replies_count - 1) } : p
              )));
            }
          } catch {}
        },
      },
    ]);
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={C.accent} /></View>;
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader
        title="Community"
        subtitle="Tips and materials from CPAce alumni"
        onBack={() => router.back()}
        right={
          <TouchableOpacity
            style={s.libBtn}
            onPress={() => router.push('/community/resources')}
          >
            <Ionicons name="folder-open" size={17} color={C.accent} />
            <Text style={s.libText}>Library</Text>
          </TouchableOpacity>
        }
      />

      <FlatList
        data={posts}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: sp.md, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => load(true)} tintColor={C.accent} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMore
            ? <ActivityIndicator color={C.accent} style={{ marginVertical: sp.md }} />
            : null
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            {item.is_pinned ? (
              <View style={s.pinRow}>
                <Ionicons name="pin" size={12} color={C.warning} />
                <Text style={s.pinText}>Pinned</Text>
              </View>
            ) : null}

            <View style={s.authorRow}>
              <GradientFill colors={grad.brandSoft} style={s.avatar}>
                <Text style={s.avatarText}>{initials(item.author_name)}</Text>
              </GradientFill>
              <View style={{ flex: 1 }}>
                <Text style={s.authorName} numberOfLines={1}>{item.author_name}</Text>
                <Text style={s.authorMeta} numberOfLines={1}>
                  {[item.author_role, item.created_on].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {item.subject_code ? (
                <View style={s.subjectChip}>
                  <Text style={s.subjectChipText}>{item.subject_code}</Text>
                </View>
              ) : null}
            </View>

            {/* Quotes read as a pull-quote rather than a plain post */}
            {item.post_type === 'tip' ? (
              <View style={s.quoteBox}>
                <Ionicons name="chatbox-ellipses" size={16} color={C.primary} />
                <Text style={s.quoteText}>{item.body}</Text>
                {item.title ? <Text style={s.quoteAttr}>— {item.title}</Text> : null}
              </View>
            ) : (
              <>
                {item.title ? <Text style={s.postTitle}>{item.title}</Text> : null}
                <Text style={s.postBody}>{item.body}</Text>
              </>
            )}

            {item.attachments.map((att) => {
              const icon = fileIcon(att.file_category);
              return (
                <TouchableOpacity
                  key={att.id}
                  style={s.attachment}
                  activeOpacity={0.8}
                  onPress={() => att.url && Linking.openURL(att.url)}
                >
                  <Ionicons name={icon.name} size={20} color={icon.color} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.attName} numberOfLines={1}>{att.original_name}</Text>
                    {att.human_size ? <Text style={s.attSize}>{att.human_size}</Text> : null}
                  </View>
                  <Ionicons name="download-outline" size={18} color={C.accent} />
                </TouchableOpacity>
              );
            })}

            <View style={s.actions}>
              <TouchableOpacity style={s.action} onPress={() => toggleLike(item)}>
                <Ionicons
                  name={item.liked_by_me ? 'heart' : 'heart-outline'}
                  size={19}
                  color={item.liked_by_me ? C.danger : C.muted}
                />
                <Text style={[s.actionText, item.liked_by_me && { color: C.danger }]}>
                  {item.likes_count > 0 ? item.likes_count : ''} Like{item.likes_count === 1 ? '' : 's'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.action} onPress={() => openComments(item)}>
                <Ionicons name="chatbubble-outline" size={18} color={C.muted} />
                <Text style={s.actionText}>
                  {item.replies_count > 0 ? item.replies_count : ''} Comment{item.replies_count === 1 ? '' : 's'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={s.emptyBox}>
            <Ionicons name="people-outline" size={48} color={C.light} />
            <Text style={s.emptyText}>
              Nothing here yet.{'\n'}Alumni posts and shared materials will appear in this feed.
            </Text>
          </View>
        }
      />

      {/* Comments sheet */}
      <Modal
        visible={!!openPost}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpenPost(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setOpenPost(null)}>
                <Text style={s.modalClose}>Close</Text>
              </TouchableOpacity>
              <Text style={s.modalTitle}>Comments</Text>
              <View style={{ width: 44 }} />
            </View>

            {loadingComments ? (
              <ActivityIndicator color={C.accent} style={{ marginTop: sp.lg }} />
            ) : (
              <ScrollView contentContainerStyle={{ padding: sp.md }}>
                {comments.length === 0 ? (
                  <Text style={s.noComments}>No comments yet. Be the first to reply.</Text>
                ) : (
                  comments.map((c) => (
                    <View key={c.id} style={s.comment}>
                      <GradientFill colors={grad.brandSoft} style={s.commentAvatar}>
                        <Text style={s.commentAvatarText}>{initials(c.author_name)}</Text>
                      </GradientFill>
                      <View style={{ flex: 1 }}>
                        <View style={s.commentBubble}>
                          <Text style={s.commentAuthor}>
                            {c.author_name}
                            {c.author_role ? <Text style={s.commentRole}>  {c.author_role}</Text> : null}
                          </Text>
                          <Text style={s.commentBody}>{c.body}</Text>
                        </View>
                        <View style={s.commentFoot}>
                          <Text style={s.commentDate}>{c.created_on}</Text>
                          {c.is_mine ? (
                            <TouchableOpacity onPress={() => deleteComment(c)}>
                              <Text style={s.commentDelete}>Delete</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            )}

            <View style={s.composer}>
              <TextInput
                style={s.composerInput}
                value={draft}
                onChangeText={setDraft}
                placeholder="Write a comment…"
                placeholderTextColor={C.light}
                multiline
                maxLength={1000}
              />
              <GradientButton
                radius={r.full}
                contentStyle={s.sendBtn}
                onPress={sendComment}
                loading={posting}
                disabled={!draft.trim()}
              >
                <Ionicons name="send" size={17} color={C.white} />
              </GradientButton>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: C.bg },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  libBtn:      { flexDirection: 'row', alignItems: 'center', gap: sp.xs },
  libText:     { color: C.accent, fontSize: 13, fontFamily: font.semiBold },
  card:        { backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.lg, padding: sp.md, marginBottom: sp.sm, borderWidth: 1, borderColor: C.border },
  pinRow:      { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  pinText:     { fontSize: 11, fontFamily: font.bold, color: C.warning },
  authorRow:   { flexDirection: 'row', alignItems: 'center', gap: sp.sm },
  avatar:      { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarText:  { fontSize: 13, fontFamily: font.bold, color: C.white },
  authorName:  { fontSize: 14, fontFamily: font.bold, color: C.text },
  authorMeta:  { fontSize: 11.5, fontFamily: font.regular, color: C.muted, marginTop: 1 },
  subjectChip: { paddingHorizontal: sp.sm, paddingVertical: 3, borderRadius: r.sm, backgroundColor: 'rgba(123,20,22,0.08)' },
  subjectChipText: { fontSize: 11, fontFamily: font.bold, color: C.primary },
  postTitle:   { fontSize: 15, fontFamily: font.bold, color: C.text, marginTop: sp.sm },
  postBody:    { fontSize: 14, fontFamily: font.regular, color: C.text, lineHeight: 21, marginTop: 6 },
  quoteBox:    { backgroundColor: 'rgba(123,20,22,0.05)', borderLeftWidth: 3, borderLeftColor: C.primary, borderRadius: r.md, padding: sp.md, marginTop: sp.sm, gap: 6 },
  quoteText:   { fontSize: 14.5, fontFamily: font.medium, color: C.text, lineHeight: 22, fontStyle: 'italic' },
  quoteAttr:   { fontSize: 12.5, fontFamily: font.semiBold, color: C.primary, textAlign: 'right' },
  attachment:  { flexDirection: 'row', alignItems: 'center', gap: sp.sm, backgroundColor: C.bg, borderRadius: r.md, padding: sp.sm, marginTop: sp.sm, borderWidth: 1, borderColor: C.border },
  attName:     { fontSize: 13, fontFamily: font.semiBold, color: C.text },
  attSize:     { fontSize: 11, fontFamily: font.regular, color: C.muted, marginTop: 1 },
  actions:     { flexDirection: 'row', gap: sp.lg, marginTop: sp.sm, paddingTop: sp.sm, borderTopWidth: 1, borderTopColor: C.border },
  action:      { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText:  { fontSize: 13, fontFamily: font.semiBold, color: C.muted },
  emptyBox:    { alignItems: 'center', paddingTop: 60, gap: sp.md },
  emptyText:   { fontSize: 14, fontFamily: font.regular, color: C.muted, textAlign: 'center', lineHeight: 21 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: sp.lg, borderBottomWidth: 1, borderBottomColor: C.border },
  modalClose:  { fontSize: 16, fontFamily: font.regular, color: C.muted },
  modalTitle:  { fontSize: 17, fontFamily: font.bold, color: C.text },
  noComments:  { fontSize: 13.5, fontFamily: font.regular, color: C.muted, textAlign: 'center', marginTop: sp.lg, fontStyle: 'italic' },
  comment:     { flexDirection: 'row', gap: sp.sm, marginBottom: sp.md },
  commentAvatar:{ width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  commentAvatarText: { fontSize: 11, fontFamily: font.bold, color: C.white },
  commentBubble:{ backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.lg, padding: sp.sm, borderWidth: 1, borderColor: C.border },
  commentAuthor:{ fontSize: 13, fontFamily: font.bold, color: C.text },
  commentRole: { fontSize: 11, fontFamily: font.regular, color: C.muted },
  commentBody: { fontSize: 13.5, fontFamily: font.regular, color: C.text, lineHeight: 20, marginTop: 2 },
  commentFoot: { flexDirection: 'row', gap: sp.md, marginTop: 4, paddingLeft: sp.xs },
  commentDate: { fontSize: 11, fontFamily: font.regular, color: C.light },
  commentDelete:{ fontSize: 11, fontFamily: font.semiBold, color: C.danger },
  composer:    { flexDirection: 'row', alignItems: 'flex-end', gap: sp.sm, padding: sp.md, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.card },
  composerInput:{ flex: 1, maxHeight: 110, backgroundColor: C.bg, borderRadius: r.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: sp.md, paddingVertical: 10, fontSize: 14, fontFamily: font.regular, color: C.text },
  sendBtn:     { width: 44, height: 44, paddingVertical: 0, paddingHorizontal: 0 },
});
