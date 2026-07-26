import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
  Image, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import client, { API_BASE } from '@/lib/api/client';
import { useAuth } from '@/lib/context/auth-context';
import { useMessages } from '@/lib/context/messages-context';
import { C, sp, r } from '@/constants/cpace-theme';

const F = {
  regular:  'Poppins_400Regular',
  medium:   'Poppins_500Medium',
  semiBold: 'Poppins_600SemiBold',
  bold:     'Poppins_700Bold',
} as const;

interface Message {
  id: number;
  body: string;
  sender_name: string;
  sender_photo: string | null;
  sender_id: number;
  is_mine: boolean;
  created_at: string;
  attachment?: {
    url: string;
    name: string;
    size: string;
    is_image: boolean;
    preview_url: string | null;
    icon: string;
    color: string;
  } | null;
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatMsgTime(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T'));
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDateHeader(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T'));
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (isToday) return 'Today';
  if (isYesterday) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function shouldShowDateHeader(current: string, previous?: string) {
  if (!previous) return true;
  const d1 = new Date(current.replace(' ', 'T'));
  const d2 = new Date(previous.replace(' ', 'T'));
  return d1.toDateString() !== d2.toDateString();
}

function shouldShowSender(current: Message, previous?: Message) {
  if (!previous) return true;
  if (previous.sender_id !== current.sender_id) return true;
  const d1 = new Date(current.created_at.replace(' ', 'T'));
  const d2 = new Date(previous.created_at.replace(' ', 'T'));
  return (d1.getTime() - d2.getTime()) > 300000; // 5 min gap
}

// File icon mapping for Ionicons
function getFileIcon(category: string) {
  const map: Record<string, string> = {
    pdf: 'document-text',
    word: 'document',
    excel: 'grid',
    powerpoint: 'easel',
    image: 'image',
    video: 'videocam',
    archive: 'folder',
    text: 'document-text',
  };
  return map[category] || 'document';
}

export default function ChatThreadScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { joinConversation, leaveConversation, onNewMessage } = useMessages();

  const conversationId = Number(id);

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [participants, setParticipants] = useState<{ id: number; name: string }[]>([]);
  const [isGroup, setIsGroup] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const textInputRef = useRef<TextInput>(null);
  const lastMsgId = useRef<number>(0);

  // Load messages
  const loadMessages = useCallback(async () => {
    try {
      const res = await client.get(`/messages/${conversationId}`);
      const msgs: Message[] = res.data.messages ?? [];
      setMessages(msgs);
      setParticipants(res.data.participants ?? []);
      setIsGroup(res.data.conversation?.type === 'group');
      if (msgs.length > 0) {
        lastMsgId.current = msgs[msgs.length - 1].id;
      }
    } catch {}
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    loadMessages();
    joinConversation(conversationId);
    return () => { leaveConversation(conversationId); };
  }, [conversationId, loadMessages, joinConversation, leaveConversation]);

  // Listen for real-time messages
  useEffect(() => {
    const unsub = onNewMessage((data: any) => {
      if (data.conversation_id === conversationId && data.message) {
        setMessages(prev => {
          // Avoid duplicates
          if (prev.some(m => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
        lastMsgId.current = data.message.id;
      }
    });
    return unsub;
  }, [conversationId, onNewMessage]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  // Send message
  const sendMessage = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setText('');

    try {
      const res = await client.post(`/messages/${conversationId}/send`, { body: trimmed });
      if (res.data.message) {
        setMessages(prev => {
          if (prev.some(m => m.id === res.data.message.id)) return prev;
          return [...prev, res.data.message];
        });
        lastMsgId.current = res.data.message.id;
      }
    } catch {
      setText(trimmed); // restore on failure
    }
    setSending(false);
  };

  // Send file
  const sendFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      setSending(true);

      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        name: file.name || 'attachment',
        type: file.mimeType || 'application/octet-stream',
      } as any);
      formData.append('body', '');

      const token = await (await import('@/lib/storage')).storage.get('auth_token');

      const res = await fetch(`${API_BASE}/messages/${conversationId}/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (data.message) {
        setMessages(prev => {
          if (prev.some(m => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
        lastMsgId.current = data.message.id;
      }
    } catch {}
    setSending(false);
  };

  const renderDateHeader = (dateStr: string) => (
    <View style={styles.dateHeader}>
      <View style={styles.dateHeaderLine} />
      <Text style={styles.dateHeaderText}>{formatDateHeader(dateStr)}</Text>
      <View style={styles.dateHeaderLine} />
    </View>
  );

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const prev = index > 0 ? messages[index - 1] : undefined;
    const next = index < messages.length - 1 ? messages[index + 1] : undefined;
    const showSender = shouldShowSender(item, prev);
    const isLastInGroup = !next || next.sender_id !== item.sender_id;

    return (
      <View>
        {/* Date header */}
        {shouldShowDateHeader(item.created_at, prev?.created_at) && renderDateHeader(item.created_at)}

        <View style={[
          styles.msgRow,
          item.is_mine ? styles.msgRowMine : styles.msgRowTheirs,
          !showSender && { marginTop: 2 },
        ]}>
          {/* Sender avatar (group chats, left side) */}
          {!item.is_mine && isGroup && (
            <View style={styles.msgAvatarWrap}>
              {showSender ? (
                item.sender_photo ? (
                  <Image source={{ uri: item.sender_photo }} style={styles.msgAvatar} />
                ) : (
                  <View style={[styles.msgAvatar, styles.msgAvatarFallback]}>
                    <Text style={styles.msgAvatarText}>{getInitials(item.sender_name)}</Text>
                  </View>
                )
              ) : (
                <View style={{ width: 32 }} />
              )}
            </View>
          )}

          <View style={[
            styles.msgBubbleWrap,
            item.is_mine ? styles.msgBubbleWrapMine : styles.msgBubbleWrapTheirs,
          ]}>
            {/* Sender name (group chats) */}
            {!item.is_mine && isGroup && showSender && (
              <Text style={styles.senderName}>{item.sender_name}</Text>
            )}

            {/* Message bubble */}
            <View style={[
              styles.msgBubble,
              item.is_mine ? styles.msgBubbleMine : styles.msgBubbleTheirs,
              // Round corners based on position in group
              !showSender && !isLastInGroup && styles.msgBubbleMid,
              !showSender && isLastInGroup && styles.msgBubbleLast,
              showSender && styles.msgBubbleFirst,
            ]}>
              {/* Attachment */}
              {item.attachment && (
                <TouchableOpacity
                  style={styles.attachmentCard}
                  onPress={() => {
                    if (item.attachment!.is_image && item.attachment!.preview_url) {
                      Linking.openURL(`${API_BASE.replace('/api', '')}${item.attachment!.preview_url}`);
                    } else {
                      Linking.openURL(`${API_BASE}${item.attachment!.url}`);
                    }
                  }}
                >
                  {item.attachment.is_image && item.attachment.preview_url ? (
                    <Image
                      source={{ uri: `${API_BASE.replace('/api', '')}${item.attachment.preview_url}` }}
                      style={styles.attachmentImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.fileCard}>
                      <View style={[styles.fileIconWrap, { backgroundColor: item.attachment.color + '20' }]}>
                        <Ionicons name={getFileIcon(item.attachment.icon) as any} size={24} color={item.attachment.color} />
                      </View>
                      <View style={styles.fileInfo}>
                        <Text style={styles.fileName} numberOfLines={1}>{item.attachment.name}</Text>
                        <Text style={styles.fileSize}>{item.attachment.size}</Text>
                      </View>
                      <Ionicons name="download-outline" size={18} color={C.muted} />
                    </View>
                  )}
                </TouchableOpacity>
              )}

              {/* Text body */}
              {item.body ? (
                <Text style={[styles.msgText, item.is_mine && styles.msgTextMine]}>
                  {item.body}
                </Text>
              ) : null}
            </View>

            {/* Timestamp */}
            {isLastInGroup && (
              <Text style={[styles.msgTime, item.is_mine && styles.msgTimeMine]}>
                {formatMsgTime(item.created_at)}
              </Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>{name || 'Chat'}</Text>
          {isGroup && participants.length > 0 && (
            <Text style={styles.headerSub}>{participants.length} members</Text>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Messages */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMessage}
          contentContainerStyle={styles.msgList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {/* Input bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.attachBtn} onPress={sendFile}>
            <Ionicons name="add-circle" size={28} color={C.primary} />
          </TouchableOpacity>

          <View style={styles.inputWrap}>
            <TextInput
              ref={textInputRef}
              style={styles.input}
              placeholder="Message..."
              placeholderTextColor="#9CA3AF"
              value={text}
              onChangeText={setText}
              multiline
              maxLength={3000}
            />
          </View>

          {text.trim().length > 0 ? (
            <TouchableOpacity
              style={styles.sendBtn}
              onPress={sendMessage}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: sp.sm, paddingVertical: 10,
    backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: '#E8ECF0',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerInfo: { flex: 1, marginLeft: 4 },
  headerName: { fontFamily: F.bold, fontSize: 16, color: C.text },
  headerSub: { fontFamily: F.regular, fontSize: 12, color: C.muted },

  // Message list
  msgList: { paddingHorizontal: sp.sm, paddingVertical: sp.sm, paddingBottom: 8 },

  // Date header
  dateHeader: {
    flexDirection: 'row', alignItems: 'center',
    marginVertical: sp.md, marginHorizontal: sp.sm,
  },
  dateHeaderLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#D1D5DB' },
  dateHeaderText: {
    fontFamily: F.regular, fontSize: 11, color: C.muted,
    marginHorizontal: 10,
  },

  // Message row
  msgRow: {
    flexDirection: 'row', marginBottom: 2,
  },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowTheirs: { justifyContent: 'flex-start' },

  // Avatar
  msgAvatarWrap: { marginRight: 6, justifyContent: 'flex-end' },
  msgAvatar: { width: 32, height: 32, borderRadius: 16 },
  msgAvatarFallback: { backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center' },
  msgAvatarText: { fontFamily: F.semiBold, fontSize: 11, color: '#fff' },

  // Bubble wrapper
  msgBubbleWrap: { maxWidth: '78%' },
  msgBubbleWrapMine: { alignItems: 'flex-end' },
  msgBubbleWrapTheirs: { alignItems: 'flex-start' },

  senderName: {
    fontFamily: F.semiBold, fontSize: 12, color: C.accent,
    marginBottom: 2, marginLeft: 12,
  },

  // Bubble
  msgBubble: {
    paddingHorizontal: 14, paddingVertical: 10,
    maxWidth: '100%',
  },
  msgBubbleMine: {
    backgroundColor: C.primary,
    borderTopRightRadius: 18,
  },
  msgBubbleTheirs: {
    backgroundColor: '#E8ECF0',
    borderTopLeftRadius: 18,
  },
  // Rounded corners for grouped messages
  msgBubbleFirst: {
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    borderBottomLeftRadius: 4, borderBottomRightRadius: 4,
  },
  msgBubbleMid: {
    borderRadius: 4,
  },
  msgBubbleLast: {
    borderBottomLeftRadius: 18, borderBottomRightRadius: 18,
    borderTopLeftRadius: 4, borderTopRightRadius: 4,
  },

  msgText: { fontFamily: F.regular, fontSize: 14.5, color: C.text, lineHeight: 20 },
  msgTextMine: { color: '#fff' },

  msgTime: {
    fontFamily: F.regular, fontSize: 11, color: C.muted,
    marginTop: 3, marginHorizontal: 12,
  },
  msgTimeMine: { textAlign: 'right' },

  // Attachment
  attachmentCard: { marginBottom: 4, borderRadius: r.md, overflow: 'hidden' },
  attachmentImage: { width: 220, height: 160, borderRadius: r.md },
  fileCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: r.md,
    padding: 10, gap: 10,
  },
  fileIconWrap: {
    width: 40, height: 40, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  fileInfo: { flex: 1 },
  fileName: { fontFamily: F.medium, fontSize: 13, color: C.text },
  fileSize: { fontFamily: F.regular, fontSize: 11, color: C.muted },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: sp.sm, paddingVertical: sp.sm,
    paddingBottom: sp.md,
    backgroundColor: C.bg,
    borderTopWidth: 1, borderTopColor: '#E8ECF0',
  },
  attachBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  inputWrap: {
    flex: 1, backgroundColor: '#f1f5f9', borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    minHeight: 42, maxHeight: 100, justifyContent: 'center',
  },
  input: {
    fontFamily: F.regular, fontSize: 14.5, color: C.text,
    padding: 0, margin: 0,
    ...(Platform.OS === 'android' ? { paddingBottom: 6 } : {}),
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center',
    marginLeft: 6,
  },
});
