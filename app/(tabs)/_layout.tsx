import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Modal, Pressable } from 'react-native';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  interpolate, Extrapolation,
} from 'react-native-reanimated';
import { C } from '@/constants/cpace-theme';

const SW     = Dimensions.get('window').width;
const FAB_D  = 58;
const CARD_H = 72;

/* ── Popup items ── */
const POPUP = [
  { icon: 'document-text' as any, label: 'Notes',        href: '/(tabs)/notes' },
  { icon: 'book'          as any, label: 'Subjects',      href: '/(tabs)/subjects' },
  { icon: 'trophy'        as any, label: 'Achievements',  href: '/achievements' },
  { icon: 'settings-sharp'as any, label: 'Settings',      href: '/settings' },
];

/* ── Tab items ── */
const TABS = [
  { id: 'home',        href: '/(tabs)/',            iconOn: 'home'      as any, iconOff: 'home-outline'      as any, label: 'Home' },
  { id: 'quizzes',     href: '/(tabs)/quizzes',     iconOn: 'flash'     as any, iconOff: 'flash-outline'     as any, label: 'Quizzes' },
  null,
  { id: 'performance', href: '/(tabs)/performance', iconOn: 'bar-chart' as any, iconOff: 'bar-chart-outline' as any, label: 'Performance' },
  { id: 'calendar',    href: '/calendar',           iconOn: 'calendar'  as any, iconOff: 'calendar-outline'  as any, label: 'Calendar' },
];

/* ── 2×2 dots inside FAB ── */
function DotsGrid() {
  return (
    <View style={{ gap: 5 }}>
      <View style={{ flexDirection: 'row', gap: 5 }}>
        <View style={s.dot} /><View style={s.dot} />
      </View>
      <View style={{ flexDirection: 'row', gap: 5 }}>
        <View style={s.dot} /><View style={s.dot} />
      </View>
    </View>
  );
}

/* ── Popup ── */
function PopupMenu({ visible, onClose, onNavigate }: {
  visible: boolean; onClose: () => void; onNavigate: (h: string) => void;
}) {
  const anim = useSharedValue(0);

  React.useEffect(() => {
    anim.value = visible
      ? withSpring(1, { damping: 16, stiffness: 220 })
      : withTiming(0, { duration: 150 });
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(anim.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    transform: [
      { scale:      interpolate(anim.value, [0, 1], [0.9, 1], Extrapolation.CLAMP) },
      { translateY: interpolate(anim.value, [0, 1], [16, 0],  Extrapolation.CLAMP) },
    ],
  }));

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        {/* stop tap from closing when touching the menu card */}
        <Pressable>
          <Animated.View style={[s.popupCard, animStyle]}>
            {POPUP.map((item) => (
              <TouchableOpacity
                key={item.label}
                style={s.popupItem}
                activeOpacity={0.7}
                onPress={() => { onNavigate(item.href); onClose(); }}
              >
                <View style={s.popupCircle}>
                  <Ionicons name={item.icon} size={22} color={C.accent} />
                </View>
                <Text style={s.popupLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ── Custom tab bar ── */
function CustomTabBar(_props: BottomTabBarProps) {
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const safeBot  = Math.max(insets.bottom, 10);

  const isActive = (href: string) => {
    const p = href.replace('/(tabs)', '');
    if (p === '/' || p === '') return pathname === '/' || pathname === '/index' || pathname === '';
    return pathname === p || pathname.startsWith(p + '/');
  };

  const go = (href: string) => router.push(href as any);

  return (
    <>
      <PopupMenu visible={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={go} />

      <View style={[s.wrapper, { paddingBottom: safeBot }]}>
        <View style={s.card}>

          {TABS.map((tab) => {
            /* ── center FAB ── */
            if (tab === null) {
              return (
                <TouchableOpacity
                  key="fab"
                  style={s.fabSlot}
                  activeOpacity={0.85}
                  onPress={() => setMenuOpen(v => !v)}
                >
                  <View style={[s.fab, menuOpen && s.fabActive]}>
                    <DotsGrid />
                  </View>
                </TouchableOpacity>
              );
            }

            /* ── regular tab ── */
            const active = isActive(tab.href);
            return (
              <TouchableOpacity
                key={tab.id}
                style={s.tab}
                activeOpacity={0.75}
                onPress={() => go(tab.href)}
              >
                <Ionicons
                  name={active ? tab.iconOn : tab.iconOff}
                  size={24}
                  color={active ? C.accent : '#9CA3AF'}
                />
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                  style={[s.tabLabel, { color: active ? C.accent : '#9CA3AF' }]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}

        </View>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  /* ── dot inside FAB ── */
  dot: { width: 11, height: 11, borderRadius: 3, backgroundColor: '#fff' },

  /* ── Popup overlay ── */
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.30)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: CARD_H + 28,
  },

  /* ── Popup card — horizontal row of 4 items ── */
  popupCard: {
    width: SW - 80,
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 40,              // very curved / pill-like
    paddingVertical: 14,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.13,
    shadowRadius: 20,
    elevation: 20,
  },
  popupItem: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  popupCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFF0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  popupLabel: {
    fontSize: 10,
    fontFamily: 'Poppins_500Medium',
    color: '#1F2937',
    textAlign: 'center',
  },

  /* ── Tab bar wrapper ── */
  wrapper: {
    width: SW,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },

  /* ── White pill card ── */
  card: {
    width: SW - 24,
    height: CARD_H,
    backgroundColor: '#fff',
    borderRadius: 36,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 20,
  },

  /* ── Regular tab ── */
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  tabLabel: {
    fontSize: 11,
    fontFamily: 'Poppins_500Medium',
    textAlign: 'center',
  },

  /* ── Center FAB slot ── */
  fabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    width: FAB_D,
    height: FAB_D,
    borderRadius: FAB_D / 2,
    backgroundColor: C.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.40,
    shadowRadius: 10,
    elevation: 10,
  },
  fabActive: {
    backgroundColor: '#5C0F11',
  },
});

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="notes" />
      <Tabs.Screen name="quizzes" />
      <Tabs.Screen name="performance" />
      <Tabs.Screen name="subjects" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="achievements" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
