import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, Image, TextInput, Modal, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import client from '@/lib/api/client';
import { useAuth } from '@/lib/context/auth-context';
import { useMessages } from '@/lib/context/messages-context';
import { C, sp, r } from '@/constants/cpace-theme';

const F = {
  regular:  'Poppins_400Regular',
  medium:   'Poppins_500Medium',
  semiBold: 'Poppins_600SemiBold',
  bold:     'Poppins_700Bold',
} as const;

interface Conversation {
  id: number;
  type: 'direct' | 'group';
  name: string;
  is_default_group: boolean;
  participant_count: number;
  other_user: { id: number; name: string; profile_photo: string | null } | null;
  latest_message: {
    body: string;
    sender_name: string;
    sender_id: number;
    created_at: string;
  } | null;
  unread_count: number;
  updated_at: string;
}

interface UserResult {
  id: number;
  name: string;
  profile_photo: string | null;
}

function formatTime(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T'));
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function MessagesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { refreshUnread, onNewMessage } = useMessages();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // New Message modal
  const [newMsgOpen, setNewMsgOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await client.get('/messages');
      setConversations(res.data.conversations ?? []);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        setLoading(true);
        await fetchConversations();
        if (active) setLoading(false);
      };
      load();
      return () => { active = false; };
    }, [fetchConversations])
  );

  // Listen for real-time new messages to refresh list
  useFocusEffect(
    useCallback(() => {
      const unsub = onNewMessage(() => {
        fetchConversations();
      });
      return unsub;
    }, [onNewMessage, fetchConversations])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchConversations();
    refreshUnread();
    setRefreshing(false);
  };

  const searchUsers = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 1) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await client.post('/messages/search-users', { query: q });
      setSearchResults(res.data.users ?? []);
    } catch {}
    setSearching(false);
  };

  const startDM = async (userId: number) => {
    setNewMsgOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    try {
      const res = await client.post('/messages/start/direct', { user_id: userId });
      const conv = res.data.conversation;
      router.push({ pathname: '/messages/[id]', params: { id: String(conv.id), name: conv.name } });
    } catch {}
  };

  const renderConversation = ({ item, index }: { item: Conversation; index: number }) => {
    const hasUnread = item.unread_count > 0;
    const isGroup = item.type === 'group';
    const photo = item.other_user?.profile_photo;

    return (
      <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
        <TouchableOpacity
          style={[styles.convoRow, hasUnread && styles.convoRowUnread]}
          activeOpacity={0.7}
          onPress={() => router.push({
            pathname: '/messages/[id]',
            params: { id: String(item.id), name: item.name },
          })}
        >
          {/* Avatar */}
          <View style={styles.avatarWrap}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, isGroup && styles.avatarGroup]}>
                {isGroup ? (
                  <Ionicons name="people" size={20} color="#fff" />
                ) : (
                  <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
                )}
              </View>
            )}
            {hasUnread && <View style={styles.unreadDot} />}
          </View>

          {/* Content */}
          <View style={styles.convoContent}>
            <View style={styles.convoTop}>
              <Text
                style={[styles.convoName, hasUnread && styles.convoNameBold]}
                numberOfLines={1}
              >
                {item.is_default_group ? '🏛️ ' : ''}{item.name}
              </Text>
              <Text style={[styles.convoTime, hasUnread && styles.convoTimeUnread]}>
                {item.latest_message ? formatTime(item.latest_message.created_at) : ''}
              </Text>
            </View>
            <View style={styles.convoBottom}>
              <Text
                style={[styles.convoPreview, hasUnread && styles.convoPreviewBold]}
                numberOfLines={1}
              >
                {item.latest_message
                  ? (item.latest_message.sender_id === user?.id ? 'You: ' : '')
                    + item.latest_message.body
                  : 'No messages yet'}
              </Text>
              {hasUnread && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>
                    {item.unread_count > 99 ? '99+' : item.unread_count}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
        <TouchableOpacity
          style={styles.newMsgBtn}
          onPress={() => { setNewMsgOpen(true); searchUsers(''); }}
        >
          <Ionicons name="create-outline" size={22} color={C.primary} />
        </TouchableOpacity>
      </View>

      {/* Conversation List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="chatbubbles-outline" size={56} color={C.light} />
          </View>
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.emptySubtitle}>
            Start a conversation by tapping the{' '}
            <Ionicons name="create-outline" size={13} color={C.primary} /> button above.
          </Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => { setNewMsgOpen(true); searchUsers(''); }}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" />
            <Text style={styles.emptyBtnText}>New Message</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderConversation}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
          }
        />
      )}

      {/* New Message Modal */}
      <Modal visible={newMsgOpen} animationType="slide" onRequestClose={() => setNewMsgOpen(false)}>
        <SafeAreaView style={styles.modalSafe} edges={['top']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setNewMsgOpen(false)} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={C.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>New Message</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search people..."
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={searchUsers}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
                <Ionicons name="close-circle" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>

          {searching ? (
            <ActivityIndicator style={{ marginTop: 40 }} size="large" color={C.accent} />
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.userRow}
                  activeOpacity={0.7}
                  onPress={() => startDM(item.id)}
                >
                  {item.profile_photo ? (
                    <Image source={{ uri: item.profile_photo }} style={styles.userAvatar} />
                  ) : (
                    <View style={[styles.userAvatar, styles.userAvatarFallback]}>
                      <Text style={styles.userAvatarText}>{getInitials(item.name)}</Text>
                    </View>
                  )}
                  <Text style={styles.userName}>{item.name}</Text>
                  <Ionicons name="chevron-forward" size={16} color={C.light} />
                </TouchableOpacity>
              )}
              contentContainerStyle={styles.userList}
              ListEmptyComponent={
                searchQuery.length > 0 ? (
                  <View style={styles.center}>
                    <Text style={styles.emptySubtitle}>No users found</Text>
                  </View>
                ) : (
                  <View style={styles.center}>
                    <Text style={styles.emptySubtitle}>Search for someone to start chatting</Text>
                  </View>
                )
              }
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: sp.md, paddingVertical: 12,
    backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: '#E8ECF0',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontFamily: F.bold, fontSize: 18, color: C.text },
  newMsgBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },

  // List
  list: { paddingBottom: 20 },

  // Conversation row
  convoRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: sp.md, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E8ECF0',
  },
  convoRowUnread: { backgroundColor: 'rgba(123,20,22,0.03)' },

  // Avatar
  avatarWrap: { position: 'relative', marginRight: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: {
    backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center',
  },
  avatarGroup: { backgroundColor: C.accent },
  avatarText: { fontFamily: F.semiBold, fontSize: 18, color: '#fff' },
  unreadDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: C.accent, borderWidth: 2.5, borderColor: C.bg,
  },

  // Content
  convoContent: { flex: 1 },
  convoTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  convoName: { fontFamily: F.medium, fontSize: 15, color: C.text, flex: 1, marginRight: 8 },
  convoNameBold: { fontFamily: F.bold },
  convoTime: { fontFamily: F.regular, fontSize: 12, color: C.muted },
  convoTimeUnread: { color: C.accent, fontFamily: F.medium },
  convoBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  convoPreview: { fontFamily: F.regular, fontSize: 13, color: C.muted, flex: 1, marginRight: 8 },
  convoPreviewBold: { fontFamily: F.medium, color: C.text },
  unreadBadge: {
    backgroundColor: C.accent, borderRadius: 12,
    paddingHorizontal: 7, paddingVertical: 2, minWidth: 22, alignItems: 'center',
  },
  unreadBadgeText: { fontFamily: F.bold, fontSize: 11, color: '#fff' },

  // Empty state
  emptyIconWrap: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontFamily: F.bold, fontSize: 18, color: C.text, marginBottom: 8 },
  emptySubtitle: { fontFamily: F.regular, fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: r.lg, marginTop: 20,
  },
  emptyBtnText: { fontFamily: F.semiBold, fontSize: 14, color: '#fff' },

  // New Message modal
  modalSafe: { flex: 1, backgroundColor: C.bg },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: sp.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#E8ECF0',
  },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: sp.md, marginTop: 12, marginBottom: 4,
    backgroundColor: '#f1f5f9', borderRadius: r.lg,
    paddingHorizontal: 14, height: 44,
  },
  searchInput: {
    flex: 1, fontFamily: F.regular, fontSize: 14, color: C.text,
    marginLeft: 8,
  },

  // User picker
  userList: { paddingBottom: 20 },
  userRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: sp.md, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E8ECF0',
  },
  userAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
  userAvatarFallback: {
    backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center',
  },
  userAvatarText: { fontFamily: F.semiBold, fontSize: 15, color: '#fff' },
  userName: { flex: 1, fontFamily: F.medium, fontSize: 15, color: C.text },
});
