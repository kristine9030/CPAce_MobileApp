import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, Pressable,
  ScrollView, Dimensions, Keyboard, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, interpolate, Extrapolation,
} from 'react-native-reanimated';
import client from '@/lib/api/client';
import { C, r, sh } from '@/constants/cpace-theme';
import { useAiTutor } from '@/lib/context/ai-tutor-context';
import { MarkdownLite } from './markdown-lite';

const SW = Dimensions.get('window').width;
const SH = Dimensions.get('window').height;
const FAB_SIZE = 58;
const PANEL_W = Math.min(SW - 24, 380);
const PANEL_MAX_H = Math.min(SH * 0.66, 560);

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider?: string;
  error?: boolean;
}

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: "Hi! I'm your **CPAce AI Tutor**. Ask me anything from your review notes — FAR, AFAR, AUD, TAX, RFBT, or MS.",
};

function TypingDots() {
  const a = useSharedValue(0);
  useEffect(() => {
    a.value = withTiming(1, { duration: 600 });
    const id = setInterval(() => { a.value = 0; a.value = withTiming(1, { duration: 600 }); }, 650);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={s.typingRow}>
      {[0, 1, 2].map((i) => <View key={i} style={s.typingDot} />)}
    </View>
  );
}

export function AiTutorWidget() {
  const insets = useSafeAreaInsets();
  const { visible, open, close, pendingQuestion, consumePendingQuestion } = useAiTutor();
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const anim = useSharedValue(0);
  const kb = useSharedValue(0);

  useEffect(() => {
    anim.value = visible
      ? withSpring(1, { damping: 17, stiffness: 220 })
      : withTiming(0, { duration: 150 });
  }, [visible]);

  // Track the keyboard height so the panel can rise above it while typing.
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: any) => {
      kb.value = withTiming(e.endCoordinates?.height ?? 0, { duration: e.duration || 220 });
    };
    const onHide = (e: any) => {
      kb.value = withTiming(0, { duration: e.duration || 200 });
    };

    const subShow = Keyboard.addListener(showEvt, onShow);
    const subHide = Keyboard.addListener(hideEvt, onHide);
    return () => { subShow.remove(); subHide.remove(); };
  }, []);

  useEffect(() => {
    if (visible && pendingQuestion) {
      const q = pendingQuestion;
      consumePendingQuestion();
      send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, pendingQuestion]);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages, sending]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;

    const userMsg: ChatMessage = { id: `u${Date.now()}`, role: 'user', content };
    const history = [...messages.filter((m) => m.id !== 'welcome'), userMsg];
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const res = await client.post('/ai-tutor/chat', {
        messages: history.slice(-20).map((m) => ({ role: m.role, content: m.content })),
      });
      setMessages((prev) => [...prev, {
        id: `a${Date.now()}`,
        role: 'assistant',
        content: res.data.reply,
        provider: res.data.provider,
      }]);
    } catch (err: any) {
      setMessages((prev) => [...prev, {
        id: `e${Date.now()}`,
        role: 'assistant',
        content: err?.message || 'Sorry, the AI Tutor is unavailable right now. Please try again.',
        error: true,
      }]);
    } finally {
      setSending(false);
    }
  };

  const reset = () => setMessages([WELCOME]);

  const fabBottom = insets.bottom + 96;
  const panelBottom = fabBottom + FAB_SIZE + 14;
  const panelTop = insets.top + 60;

  // Panel is anchored by both `top` and `bottom` (not a fixed height), so as
  // `bottom` rises with the keyboard the panel shrinks to stay fully visible
  // above it instead of being pushed off-screen.
  const panelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(anim.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    bottom: panelBottom + kb.value,
    transform: [
      { scale:      interpolate(anim.value, [0, 1], [0.9, 1], Extrapolation.CLAMP) },
      { translateY: interpolate(anim.value, [0, 1], [20, 0], Extrapolation.CLAMP) },
    ],
  }));

  const closeFabStyle = useAnimatedStyle(() => ({
    bottom: fabBottom + kb.value,
  }));

  return (
    <>
      {!visible && (
        <TouchableOpacity
          style={[s.fab, { bottom: fabBottom, right: 20 }, sh.md]}
          activeOpacity={0.85}
          onPress={open}
        >
          <Ionicons name="sparkles" size={26} color={C.white} />
        </TouchableOpacity>
      )}

      <Modal transparent visible={visible} animationType="none" onRequestClose={close}>
        <View style={StyleSheet.absoluteFill}>
          {/* Backdrop — a sibling of the panel, not an ancestor, so it never
              competes with the ScrollView inside the panel for touch responder. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />

          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <Animated.View style={[s.panel, { top: panelTop, right: 20, width: PANEL_W, maxHeight: PANEL_MAX_H }, sh.md, panelStyle]}>
              <View style={{ flex: 1 }}>
                {/* Header */}
                <View style={s.head}>
                  <View style={s.headAvatar}>
                    <Ionicons name="sparkles" size={20} color={C.white} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.headTitle}>CPACE AI Tutor</Text>
                    <Text style={s.headSub}>Ask anything from your review notes</Text>
                  </View>
                  <TouchableOpacity onPress={reset} style={s.headBtn}>
                    <Ionicons name="refresh" size={18} color="rgba(255,255,255,0.9)" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={close} style={s.headBtn}>
                    <Ionicons name="close" size={20} color="rgba(255,255,255,0.9)" />
                  </TouchableOpacity>
                </View>

                {/* Body */}
                <ScrollView ref={scrollRef} style={s.body} contentContainerStyle={{ padding: 12, gap: 10 }}>
                  {messages.map((m) => (
                    <View key={m.id} style={[s.bubbleWrap, m.role === 'user' ? s.bubbleWrapUser : s.bubbleWrapBot]}>
                      <View style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleBot, m.error && s.bubbleError]}>
                        {m.role === 'user' ? (
                          <Text style={s.bubbleUserText}>{m.content}</Text>
                        ) : (
                          <MarkdownLite text={m.content} color={m.error ? C.danger : C.text} />
                        )}
                      </View>
                      {m.provider && m.provider !== 'mock' && (
                        <Text style={s.providerTag}>via {m.provider}</Text>
                      )}
                    </View>
                  ))}
                  {sending && (
                    <View style={[s.bubbleWrap, s.bubbleWrapBot]}>
                      <View style={[s.bubble, s.bubbleBot]}><TypingDots /></View>
                    </View>
                  )}
                </ScrollView>

                {/* Footer */}
                <View style={s.foot}>
                  <TextInput
                    style={s.input}
                    value={input}
                    onChangeText={setInput}
                    placeholder="Ask a question…"
                    placeholderTextColor={C.light}
                    multiline
                    maxLength={2000}
                  />
                  <TouchableOpacity
                    style={[s.sendBtn, (!input.trim() || sending) && { opacity: 0.5 }]}
                    onPress={() => send()}
                    disabled={!input.trim() || sending}
                  >
                    {sending ? <ActivityIndicator size="small" color={C.white} /> : <Ionicons name="send" size={16} color={C.white} />}
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>

            <Animated.View style={[s.fab, { right: 20 }, sh.md, closeFabStyle]}>
              <TouchableOpacity style={s.fabTouch} activeOpacity={0.85} onPress={close}>
                <Ionicons name="close" size={26} color={C.white} />
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: C.primary,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  fabTouch: {
    width: '100%',
    height: '100%',
    borderRadius: FAB_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  panel: {
    position: 'absolute',
    backgroundColor: C.white,
    borderRadius: r.xl,
    overflow: 'hidden',
    zIndex: 50,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.primary,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },
  headTitle: { color: C.white, fontFamily: 'Poppins_700Bold', fontSize: 14 },
  headSub: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontFamily: 'Poppins_400Regular' },
  headBtn: { padding: 4 },
  body: { flex: 1, backgroundColor: '#faf6f6' },
  bubbleWrap: { maxWidth: '85%' },
  bubbleWrapUser: { alignSelf: 'flex-end' },
  bubbleWrapBot: { alignSelf: 'flex-start' },
  bubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  bubbleUser: { backgroundColor: C.primary, borderBottomRightRadius: 3 },
  bubbleBot: { backgroundColor: C.white, borderWidth: 1, borderColor: '#eee', borderBottomLeftRadius: 3 },
  bubbleError: { borderColor: C.danger, backgroundColor: '#fdf0f0' },
  bubbleUserText: { color: C.white, fontSize: 14, lineHeight: 20, fontFamily: 'Poppins_400Regular' },
  providerTag: { fontSize: 10, color: C.light, marginTop: 2, marginLeft: 4 },
  foot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: C.white,
  },
  input: {
    flex: 1,
    maxHeight: 90,
    backgroundColor: '#f4f4f5',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 14,
    color: C.text,
    fontFamily: 'Poppins_400Regular',
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  typingRow: { flexDirection: 'row', gap: 4, paddingVertical: 2 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.light },
});
