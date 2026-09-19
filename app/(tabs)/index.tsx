import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, Image, Modal, Pressable,
  TextInput, FlatList, Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
  FadeInDown, FadeInUp,
} from 'react-native-reanimated';
import client from '@/lib/api/client';
import { useAuth } from '@/lib/context/auth-context';
import { useMessages } from '@/lib/context/messages-context';
import { C, sp, r, grad, gradDir } from '@/constants/cpace-theme';
import { GradientBorder, GradientFill } from '@/components/ui/gradient';

const SW = Dimensions.get('window').width;
const SUBJECT_CARD_W = 120;
const SUBJECT_CARD_H = 120;
const RECOMMEND_CARD_W = SW - 64;
const RECOMMEND_CARD_H = 232;

const F = {
  regular:   'Poppins_400Regular',
  medium:    'Poppins_500Medium',
  semiBold:  'Poppins_600SemiBold',
  bold:      'Poppins_700Bold',
  extraBold: 'Poppins_800ExtraBold',
  black:     'Poppins_900Black',
} as const;

/* ── Subject icons (mapped by code) ── */
const SUBJECT_ICONS: Record<string, string> = {
  'Auditing':     'scan',
  'Taxation':     'receipt',
  'Accountancy':  'calculator',
  'Regulatory':   'gavel',
  'Management':   'people',
  'Finance':      'trending-up',
  'Accounting':   'calculator',
};

/* ── CPAce topic illustrations (3D gradient decorative elements) ── */
function TopicIllustration({ type }: { type: string }) {
  let iconName: any = 'book';

  switch (type) {
    case 'accounting':  iconName = 'calculator';  break;
    case 'auditing':    iconName = 'scan';        break;
    case 'taxation':    iconName = 'receipt';     break;
    case 'management':  iconName = 'people';      break;
    // "gavel" is not an Ionicon — it rendered as a blank box.
    case 'regulatory':  iconName = 'hammer';      break;
    case 'finance':     iconName = 'trending-up'; break;
    default:            iconName = 'book';        break;
  }

  return (
    <LinearGradient
      colors={grad.brand}
      start={gradDir.diagonal.start}
      end={gradDir.diagonal.end}
      style={illStyles.container}
    >
      {/* Background decorative rings */}
      <View style={[illStyles.ring, { borderColor: 'rgba(255,255,255,0.35)', width: 100, height: 100, top: -15, right: -20 }]} />
      <View style={[illStyles.ring, { borderColor: 'rgba(255,255,255,0.22)', width: 60, height: 60, bottom: 5, left: -10 }]} />

      {/* Floating orbs */}
      <View style={[illStyles.orb, { backgroundColor: 'rgba(255,255,255,0.16)', width: 44, height: 44, borderRadius: 22, top: 10, right: 30 }]} />
      <View style={[illStyles.orb, { backgroundColor: 'rgba(255,255,255,0.12)', width: 28, height: 28, borderRadius: 14, bottom: 15, left: 20 }]} />
      <View style={[illStyles.orb, { backgroundColor: 'rgba(255,255,255,0.20)', width: 14, height: 14, borderRadius: 7, top: 20, left: 40 }]} />

      {/* Main icon with glow */}
      <View style={[illStyles.iconGlow, { backgroundColor: 'rgba(255,255,255,0.18)' }]} />
      <Ionicons name={iconName} size={40} color="#fff" style={illStyles.icon} />

      {/* Small accent dots */}
      <View style={[illStyles.dot, { backgroundColor: '#fff', top: 12, right: 14 }]} />
      <View style={[illStyles.dot, { backgroundColor: '#fff', bottom: 20, right: 50 }]} />
      <View style={[illStyles.dotSmall, { backgroundColor: '#fff', bottom: 10, left: 16 }]} />
      <View style={[illStyles.dotSmall, { backgroundColor: '#fff', top: 30, left: 14 }]} />
    </LinearGradient>
  );
}

const illStyles = StyleSheet.create({
  container: {
    width: '100%',
    height: 100,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
    borderRadius: 999,
    opacity: 0.3,
  },
  orb: {
    position: 'absolute',
    opacity: 0.8,
  },
  iconGlow: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  icon: {
    zIndex: 1,
  },
  dot: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 3.5,
    opacity: 0.45,
  },
  dotSmall: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.35,
  },
});

/* ── Interfaces ── */
interface DashboardData {
  streak: number;
  points: number;
  days_to_exam: number | null;
  questions_attempted: number;
  questions_this_week: number;
  study_hours: number;
  study_hours_week: number;
  readiness: number;
  subject_mastery: { id: number; code: string; name: string; color: string; mastery: number }[];
  weaknesses: { topic: string; subject_code: string; accuracy_rate: number }[];
  recent_activity: any[];
}

interface Notification {
  id: number;
  type: string;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
}

interface SearchSubject { id: number; code: string; name: string; color: string }
interface SearchNote    { id: number; title: string; content: string }
interface SearchTopic   { id: number; name: string; subjectId: number; subjectCode: string; subjectName: string; color: string }
interface SearchPage    { name: string; icon: string; route: string; keywords: string[] }
interface SearchAch     { name: string; description: string; icon: string }

interface SubjectFull {
  id: number; code: string; name: string; description: string;
  color: string; icon: string; question_count: number; mastery: number;
}

interface TopicRecommendation {
  id: string;
  title: string;
  subject: string;
  subjectCode: string;
  lessons: number;
  estimatedTime: string;
  type: string;
  color: string;
  mastery: number;
  reason: string;
}

/* ── Global search data ── */
const SEARCH_PAGES: SearchPage[] = [
  { name: 'Performance', icon: 'stats-chart', route: '/(tabs)/performance', keywords: ['progress', 'scores', 'accuracy', 'results', 'stats', 'analytics', 'metrics', 'tracking', 'mastery', 'chart'] },
  { name: 'Achievements', icon: 'trophy', route: '/achievements', keywords: ['badges', 'rewards', 'trophies', 'earned', 'unlocked', 'goals', 'milestones', 'medals'] },
  { name: 'Quizzes', icon: 'help-circle', route: '/(tabs)/quizzes', keywords: ['exam', 'test', 'practice', 'questions', 'assessment', 'challenge', 'adaptive', 'timed', 'topic', 'mock'] },
  { name: 'Notes', icon: 'document-text', route: '/(tabs)/notes', keywords: ['review', 'study', 'materials', 'summary', 'revision', 'highlights', 'annotations', 'reading'] },
  { name: 'Settings', icon: 'settings', route: '/(tabs)/settings', keywords: ['profile', 'account', 'preferences', 'configuration', 'password', 'email', 'logout'] },
  { name: 'Dashboard', icon: 'home', route: '/(tabs)', keywords: ['home', 'overview', 'main', 'landing', 'subjects', 'streak'] },
  { name: 'AI Tutor', icon: 'chatbubbles', route: '/(tabs)', keywords: ['help', 'assistant', 'chat', 'questions', 'explain', 'tutor', 'guide'] },
];

const SEARCH_ACHIEVEMENTS: SearchAch[] = [
  { name: 'First Quiz', description: 'Complete your first quiz.', icon: 'flash' },
  { name: '3-Day Streak', description: 'Study 3 days in a row.', icon: 'flame' },
  { name: 'Week Warrior', description: 'Study 7 days in a row.', icon: 'flame' },
  { name: 'Monthly Champion', description: 'Study 30 days in a row.', icon: 'flame' },
  { name: '100 Points', description: 'Earn 100 total points.', icon: 'star' },
  { name: '500 Points', description: 'Earn 500 total points.', icon: 'star' },
  { name: 'Point Millionaire', description: 'Earn 1,000 total points.', icon: 'trophy' },
  { name: 'CPACE Legend', description: 'Earn 5,000 total points.', icon: 'trophy' },
  { name: 'Topic Explorer', description: 'Complete quizzes in 10 different topics.', icon: 'book' },
  { name: 'Quick Thinker', description: 'Answer 20 questions correctly in under 10 minutes.', icon: 'bolt' },
  { name: 'Sharpshooter', description: 'Score 90% or higher on any quiz.', icon: 'bullseye' },
  { name: 'Centurion', description: 'Answer 100 questions across all quizzes.', icon: 'help-buoy' },
  { name: 'Mock Master', description: 'Complete 5 mock exams.', icon: 'document-text' },
  { name: 'Time Manager', description: 'Finish 10 timed quizzes with 70%+ accuracy.', icon: 'clock' },
  { name: 'Board Ready', description: 'Reach 80% overall readiness.', icon: 'school' },
  { name: 'Subject Master', description: 'Achieve 80%+ accuracy in any subject.', icon: 'layers' },
  { name: 'Score Booster', description: 'Improve overall accuracy by 10%.', icon: 'trending-up' },
];

/* ── Subject card images (mapped by code) ── */
const SUBJECT_IMAGES: Record<string, any> = {
  'AUD':  require('@/assets/images/AUD.png'),
  'FAR':  require('@/assets/images/FAR.png'),
  'MS':   require('@/assets/images/MS.png'),
  'TAX':  require('@/assets/images/TAX.png'),
  'AFAR': require('@/assets/images/AFAR.png'),
  'RFBT': require('@/assets/images/RFBT.png'),
};

/* ── Animated subject card ── */
function AnimSubjectCard({ item, index, onPress }: {
  item: SubjectFull; index: number; onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(scale.value, { damping: 12, stiffness: 200 }) }],
  }));

  const subjectImg = SUBJECT_IMAGES[item.code];

  return (
    <Animated.View entering={FadeInDown.delay(index * 80).springify()}>
      <Pressable
        onPressIn={() => { scale.value = 0.95; }}
        onPressOut={() => { scale.value = 1; }}
        onPress={onPress}
      >
        <Animated.View style={[styles.subjectCardWrap, animStyle]}>
          <GradientBorder radius={22} width={2} style={{ flex: 1 }} innerStyle={{ flex: 1 }}>
          <View style={styles.subjectCard}>
            {subjectImg ? (
              <Image source={subjectImg} style={styles.subjectImg} resizeMode="contain" />
            ) : (
              <View style={[styles.subjectImgFallback, { backgroundColor: (item.color || C.primary) + '18' }]}>
                <Ionicons
                  name={(SUBJECT_ICONS[item.name] ?? 'library') as any}
                  size={28}
                  color={item.color || C.primary}
                />
              </View>
            )}
            <View style={styles.subjectCardBottom}>
              <Text style={styles.subjectName} numberOfLines={1}>{item.code}</Text>
            </View>
          </View>
          </GradientBorder>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/* ── Animated recommendation card ── */
function AnimRecommendCard({ item, index, onPress }: {
  item: TopicRecommendation; index: number; onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(scale.value, { damping: 12, stiffness: 200 }) }],
  }));

  return (
    <Animated.View entering={FadeInUp.delay(index * 120).springify()}>
      <Pressable
        onPressIn={() => { scale.value = 0.97; }}
        onPressOut={() => { scale.value = 1; }}
        onPress={onPress}
      >
        <Animated.View style={[styles.recommendCardWrap, animStyle]}>
          <View style={styles.recommendCard}>
              <TopicIllustration type={item.type} />
              <View style={styles.recommendBody}>
              <View style={styles.recommendTopRow}>
                <Text style={styles.recommendTitle} numberOfLines={1}>{item.title}</Text>
                {item.mastery > 0 && (
                  <GradientFill colors={masteryRamp(item.mastery)} style={styles.recommendBadge}>
                    <Text style={styles.recommendBadgeText}>{item.mastery}%</Text>
                  </GradientFill>
                )}
              </View>
              <Text style={styles.recommendSubject}>{item.subjectCode}</Text>
              <View style={styles.recommendMeta}>
                <Ionicons name="book-outline" size={12} color={C.muted} />
                <Text style={styles.recommendMetaText}>{item.lessons} Lessons</Text>
                <View style={styles.recommendDot} />
                <Ionicons name="time-outline" size={12} color={C.muted} />
                <Text style={styles.recommendMetaText}>{item.estimatedTime}</Text>
              </View>
              {item.reason && (
                <GradientFill colors={grad.glass} style={styles.recommendReason}>
                  <Ionicons name="bulb-outline" size={11} color={C.primary} />
                  <Text style={styles.recommendReasonText}>{item.reason}</Text>
                </GradientFill>
              )}
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/* ── Continue Learning Card ── */
function ContinueLearningCard({ readiness, points, streak, onPress }: {
  readiness: number; points: number; streak: number; onPress: () => void;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(400).springify()} style={styles.continueCardWrap}>
      <View>
        <Pressable onPress={onPress}>
          <LinearGradient
            colors={['rgba(58,8,9,0.88)', 'rgba(92,15,17,0.88)', 'rgba(123,20,22,0.88)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.continueCard}
          >
          <View style={styles.continueDecor1} />
          <View style={styles.continueDecor2} />

          <View style={styles.continueContent}>
            <View style={styles.continueLeft}>
              <Text style={styles.continueTitle}>Continue Learning</Text>
              <Text style={styles.continueSub}>Keep your momentum going!</Text>

              <View style={styles.continueStats}>
                <View style={styles.continueStat}>
                  <Ionicons name="flame" size={14} color="#E8A060" />
                  <Text style={styles.continueStatText}>{streak} day streak</Text>
                </View>
                <View style={styles.continueStat}>
                  <Ionicons name="star" size={14} color="#F0C87A" />
                  <Text style={styles.continueStatText}>{points.toLocaleString()} pts</Text>
                </View>
                <View style={styles.continueStat}>
                  <Ionicons name="checkmark-circle" size={14} color="#C8E6C9" />
                  <Text style={styles.continueStatText}>{readiness}% ready</Text>
                </View>
              </View>
            </View>

            <View style={styles.continueRight}>
              <View style={styles.continueCircle}>
                <Text style={styles.continueCircleText}>{readiness}%</Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color="rgba(255,255,255,0.6)" style={{ marginTop: 8 }} />
            </View>
          </View>
        </LinearGradient>
        </Pressable>
      </View>
    </Animated.View>
  );
}

/* ── Main Dashboard ── */
export default function DashboardScreen() {
  const { user, logout }  = useAuth();
  const { unreadCount: msgUnread } = useMessages();
  const insets = useSafeAreaInsets();
  const router            = useRouter();
  const [data, setData]         = useState<DashboardData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refresh, setRefresh]   = useState(false);
  const [avatarMenu, setAvatarMenu] = useState(false);

  const [notifOpen, setNotifOpen]   = useState(false);
  const [notifs, setNotifs]         = useState<Notification[]>([]);
  const [unread, setUnread]         = useState(0);
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery]           = useState('');
  const [allSubjects, setAllSubjects] = useState<SearchSubject[]>([]);
  const [allNotes, setAllNotes]       = useState<SearchNote[]>([]);
  const [allTopics, setAllTopics]     = useState<SearchTopic[]>([]);

  const [subjects, setSubjects] = useState<SubjectFull[]>([]);
  const [recommendations, setRecommendations] = useState<TopicRecommendation[]>([]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefresh(true);
    try {
      const res = await client.get('/dashboard');
      setData(res.data);
      buildRecommendations(res.data);
    } catch {}
    try {
      const res = await client.get('/notifications');
      setNotifs(res.data.notifications ?? []);
      setUnread(res.data.unread_count ?? 0);
    } catch {}
    try {
      const res = await client.get('/subjects');
      setSubjects(res.data.subjects ?? res.data ?? []);
    } catch {}
    setLoading(false);
    setRefresh(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const buildRecommendations = (dashboard: DashboardData) => {
    const recs: TopicRecommendation[] = [];

    if (dashboard.weaknesses && dashboard.weaknesses.length > 0) {
      dashboard.weaknesses.forEach((w, i) => {
        recs.push({
          id: `weak-${i}`,
          title: w.topic,
          subject: w.subject_code,
          subjectCode: w.subject_code,
          lessons: Math.floor(Math.random() * 8) + 3,
          estimatedTime: `${Math.floor(Math.random() * 45) + 15} min`,
          type: w.subject_code.toLowerCase().includes('aud') ? 'auditing'
            : w.subject_code.toLowerCase().includes('tax') ? 'taxation'
            : w.subject_code.toLowerCase().includes('man') ? 'management'
            : w.subject_code.toLowerCase().includes('reg') ? 'regulatory'
            : w.subject_code.toLowerCase().includes('fin') ? 'finance'
            : 'accounting',
          color: C.accent,
          mastery: Math.round(w.accuracy_rate),
          reason: `Your weakest topic — review for improvement`,
        });
      });
    }

    if (dashboard.subject_mastery) {
      dashboard.subject_mastery
        .filter(s => s.mastery < 60)
        .sort((a, b) => a.mastery - b.mastery)
        .forEach((s, i) => {
          if (recs.length >= 6) return;
          recs.push({
            id: `sub-${s.id}`,
            title: `${s.name} Fundamentals`,
            subject: s.code,
            subjectCode: s.code,
            lessons: Math.floor(Math.random() * 6) + 2,
            estimatedTime: `${Math.floor(Math.random() * 30) + 10} min`,
            type: s.name.toLowerCase().includes('audit') ? 'auditing'
              : s.name.toLowerCase().includes('tax') ? 'taxation'
              : s.name.toLowerCase().includes('manage') ? 'management'
              : s.name.toLowerCase().includes('regulat') ? 'regulatory'
              : s.name.toLowerCase().includes('financ') ? 'finance'
              : 'accounting',
            color: s.color || C.accent,
            mastery: s.mastery,
            reason: s.mastery === 0 ? 'Not started yet' : `Needs more practice`,
          });
        });
    }

    if (recs.length === 0) {
      const fallbackTopics = [
        { title: 'Cash and Cash Equivalents', type: 'accounting', subjectCode: 'AUD', lessons: 5, time: '25 min' },
        { title: 'Income Tax Compliance', type: 'taxation', subjectCode: 'TAX', lessons: 8, time: '40 min' },
        { title: 'Audit Procedures', type: 'auditing', subjectCode: 'AUD', lessons: 6, time: '30 min' },
        { title: 'Financial Ratios', type: 'finance', subjectCode: 'MAS', lessons: 4, time: '20 min' },
        { title: 'Corporate Governance', type: 'regulatory', subjectCode: 'REG', lessons: 7, time: '35 min' },
        { title: 'Cost Accounting', type: 'management', subjectCode: 'MAS', lessons: 5, time: '25 min' },
      ];
      fallbackTopics.forEach((t, i) => {
        recs.push({
          id: `fb-${i}`,
          title: t.title,
          subject: t.subjectCode,
          subjectCode: t.subjectCode,
          lessons: t.lessons,
          estimatedTime: t.time,
          type: t.type,
          color: C.accent,
          mastery: 0,
          reason: '',
        });
      });
    }

    setRecommendations(recs);
  };

  const openSearch = async () => {
    setQuery('');
    setSearchOpen(true);
    try {
      const [subRes, noteRes] = await Promise.all([
        client.get('/subjects'),
        client.get('/review-notes'),
      ]);
      const subs = subRes.data.subjects ?? subRes.data ?? [];
      setAllSubjects(subs);
      setAllNotes(noteRes.data.data ?? []);
      const topics: SearchTopic[] = [];
      const walk = (nodes: any[], subject: any) => {
        for (const n of nodes) {
          topics.push({ id: n.id, name: n.name, subjectId: subject.id, subjectCode: subject.code, subjectName: subject.name, color: subject.color });
          if (n.children?.length) walk(n.children, subject);
        }
      };
      for (const s of subs) {
        if (s.topics) walk(s.topics, s);
      }
      setAllTopics(topics);
    } catch {}
  };

  const markAllRead = async () => {
    try { await client.post('/notifications/read-all'); } catch {}
    setNotifs(n => n.map(x => ({ ...x, read: true })));
    setUnread(0);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  const d = data!;
  const daysToExam = d?.days_to_exam ?? 0;
  const initials = (user?.first_name?.[0] ?? '') + (user?.last_name?.[0] ?? '');

  const greetingText = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image source={require('@/assets/images/logo-icon.png')} style={styles.logoImg} resizeMode="contain" />
          <View>
            <Image source={require('@/assets/images/wordmark-cropped.png')} style={styles.wordmarkImg} resizeMode="contain" />
            <Text style={styles.appTagline}>Your Edge to CPALE</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.hdrBtn} onPress={openSearch}>
            <Ionicons name="search" size={17} color={C.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.hdrBtn} onPress={() => router.push('/messages' as any)}>
            <Ionicons name="chatbubbles" size={17} color={C.text} />
            {msgUnread > 0 && <View style={styles.msgDot} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.hdrBtn} onPress={() => setNotifOpen(true)}>
            <Ionicons name="notifications" size={17} color={C.text} />
            {unread > 0 && <View style={styles.notifDot} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.avatarWrap} activeOpacity={0.8} onPress={() => setAvatarMenu(v => !v)}>
            {user?.profile_photo ? (
              <Image source={{ uri: user.profile_photo }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
            <View style={styles.onlineDot} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Avatar dropdown ── */}
      <Modal transparent visible={avatarMenu} animationType="fade" onRequestClose={() => setAvatarMenu(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setAvatarMenu(false)}>
          <Pressable style={styles.menuCard}>
            <View style={styles.menuUserRow}>
              {user?.profile_photo ? (
                <Image source={{ uri: user.profile_photo }} style={styles.menuAvatar} />
              ) : (
                <View style={[styles.menuAvatar, styles.avatarFallback]}>
                  <Text style={[styles.avatarInitials, { fontSize: 14 }]}>{initials}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.menuName}>{user?.first_name} {user?.last_name}</Text>
                <Text style={styles.menuEmail}>{user?.email}</Text>
              </View>
            </View>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setAvatarMenu(false); router.push('/settings' as any); }}>
              <Ionicons name="settings-outline" size={18} color="#374151" />
              <Text style={styles.menuItemText}>Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={async () => { setAvatarMenu(false); await logout(); }}>
              <Ionicons name="log-out-outline" size={18} color="#EF4444" />
              <Text style={[styles.menuItemText, { color: '#EF4444' }]}>Log out</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Search modal ── */}
      <Modal visible={searchOpen} animationType="slide" onRequestClose={() => setSearchOpen(false)}>
        <View style={[{ flex: 1, backgroundColor: C.bg }, { paddingTop: insets.top }]}>
          <View style={styles.searchHeader}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={16} color="#9CA3AF" />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search subjects, topics, pages..."
                placeholderTextColor="#9CA3AF"
                autoFocus
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')}>
                  <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity onPress={() => setSearchOpen(false)}>
              <Text style={styles.searchCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* This modal searches what's already loaded; the full screen also
              covers class quizzes, community posts and the resource library. */}
          <TouchableOpacity
            style={styles.searchAllRow}
            activeOpacity={0.8}
            onPress={() => {
              setSearchOpen(false);
              router.push({ pathname: '/search', params: query.trim() ? { q: query.trim() } : {} });
            }}
          >
            <Ionicons name="globe-outline" size={16} color={C.accent} />
            <Text style={styles.searchAllText}>
              {query.trim() ? `Search everything for “${query.trim()}”` : 'Search everything'}
            </Text>
            <Ionicons name="chevron-forward" size={15} color={C.light} />
          </TouchableOpacity>

          <SearchResults
            query={query}
            subjects={allSubjects}
            topics={allTopics}
            notes={allNotes}
            weaknesses={data?.weaknesses ?? []}
            onSubject={(sub) => {
              setSearchOpen(false);
              router.push({ pathname: '/(tabs)/quizzes', params: { subjectId: sub.id, subjectCode: sub.code } });
            }}
            onTopic={(topic) => {
              setSearchOpen(false);
              router.push({ pathname: '/topic-materials', params: { subjectId: String(topic.subjectId), topicId: String(topic.id), subjectCode: topic.subjectCode, topicName: topic.name } });
            }}
            onNote={() => {
              setSearchOpen(false);
              router.push('/(tabs)/notes');
            }}
            onPage={(route) => {
              setSearchOpen(false);
              router.push(route as any);
            }}
          />
        </View>
      </Modal>

      {/* ── Notifications modal ── */}
      <Modal visible={notifOpen} animationType="slide" onRequestClose={() => { setSelectedNotif(null); setNotifOpen(false); }}>
        <View style={[styles.notifModalSafe, { paddingTop: insets.top }]}>
          {/* ── Detail view ── */}
          {selectedNotif ? (
            <>
              <View style={styles.notifModalHeader}>
                <TouchableOpacity onPress={() => setSelectedNotif(null)} style={styles.notifBackBtn}>
                  <Ionicons name="arrow-back" size={22} color={C.text} />
                </TouchableOpacity>
                <Text style={styles.notifModalTitle}>Notification</Text>
                <View style={{ width: 80 }} />
              </View>
              <View style={styles.notifDivider} />
              <ScrollView contentContainerStyle={styles.notifDetailScroll} showsVerticalScrollIndicator={false}>
                <LinearGradient
                  colors={[notifColor(selectedNotif.type) + '12', notifColor(selectedNotif.type) + '05']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.notifDetailHero}
                >
                  <View style={[styles.notifDetailIconCircle, { backgroundColor: notifColor(selectedNotif.type) + '20' }]}>
                    <Ionicons name={notifIcon(selectedNotif.type)} size={32} color={notifColor(selectedNotif.type)} />
                  </View>
                </LinearGradient>
                <View style={styles.notifDetailBody}>
                  <View style={styles.notifDetailTypeBadge}>
                    <View style={[styles.notifDetailTypeDot, { backgroundColor: notifColor(selectedNotif.type) }]} />
                    <Text style={[styles.notifDetailTypeText, { color: notifColor(selectedNotif.type) }]}>{selectedNotif.type.charAt(0).toUpperCase() + selectedNotif.type.slice(1)}</Text>
                  </View>
                  <Text style={styles.notifDetailTitle}>{selectedNotif.title}</Text>
                  <Text style={styles.notifDetailTime}>{formatFullNotifTime(selectedNotif.created_at)}</Text>
                  <View style={styles.notifDetailDivider} />
                  <Text style={styles.notifDetailMsg}>{selectedNotif.body}</Text>
                </View>
              </ScrollView>
            </>
          ) : (
            <>
              {/* ── List view ── */}
              <View style={styles.notifModalHeader}>
                <TouchableOpacity onPress={() => { setNotifOpen(false); }} style={styles.notifBackBtn}>
                  <Ionicons name="arrow-back" size={22} color={C.text} />
                </TouchableOpacity>
                <Text style={styles.notifModalTitle}>Notifications</Text>
                {unread > 0 ? (
                  <TouchableOpacity onPress={markAllRead}>
                    <Text style={styles.notifMarkAll}>Mark all read</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{ width: 80 }} />
                )}
              </View>
              <View style={styles.notifDivider} />

              {notifs.length === 0 ? (
                <View style={styles.notifEmptyWrap}>
                  <View style={styles.notifEmptyCircle}>
                    <Ionicons name="notifications-off-outline" size={36} color="#D1D5DB" />
                  </View>
                  <Text style={styles.notifEmptyTitle}>You&apos;re all caught up!</Text>
                  <Text style={styles.notifEmptySub}>No notifications yet. We&apos;ll let you know when something comes up.</Text>
                </View>
              ) : (
                <FlatList
                  data={notifs}
                  keyExtractor={(item) => String(item.id)}
                  contentContainerStyle={styles.notifListContent}
                  showsVerticalScrollIndicator={false}
                  ListHeaderComponent={unread > 0 ? (
                    <View style={styles.notifBanner}>
                      <Ionicons name="eye-outline" size={16} color={C.primary} />
                      <Text style={styles.notifBannerText}>You have {unread} unread notification{unread > 1 ? 's' : ''}</Text>
                    </View>
                  ) : null}
                  renderItem={({ item: n }) => (
                    <TouchableOpacity
                      style={[styles.notifFullRow, !n.read && styles.notifFullRowUnread]}
                      activeOpacity={0.7}
                      onPress={() => {
                        setSelectedNotif(n);
                        if (!n.read) {
                          setNotifs((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true } : x));
                          setUnread((prev) => Math.max(0, prev - 1));
                          client.post('/notifications/read-all').catch(() => {});
                        }
                      }}
                    >
                      <View style={[styles.notifFullIcon, { backgroundColor: notifColor(n.type) + '15' }]}>
                        <View style={[styles.notifFullIconInner, { backgroundColor: notifColor(n.type) + '25' }]}>
                          <Ionicons name={notifIcon(n.type)} size={18} color={notifColor(n.type)} />
                        </View>
                      </View>
                      <View style={styles.notifFullContent}>
                        <View style={styles.notifFullTopRow}>
                          <Text style={[styles.notifFullTitle, !n.read && { fontFamily: F.bold }]} numberOfLines={1}>{n.title}</Text>
                          {!n.read && <View style={styles.notifUnreadDot} />}
                        </View>
                        <Text style={styles.notifFullBody} numberOfLines={2}>{n.body}</Text>
                        <View style={styles.notifFullBottomRow}>
                          <Ionicons name="time-outline" size={11} color="#B0B8C4" />
                          <Text style={styles.notifFullTime}>{formatNotifTime(n.created_at)}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              )}
            </>
          )}
        </View>
      </Modal>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refresh} onRefresh={() => load(true)} tintColor={C.accent} />
        }
      >

        {/* ── Welcome Card ── */}
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <LinearGradient
            colors={['#4A0A0C', C.primary, '#9B1B1B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.welcomeCard}
          >
            <View style={styles.welcomeDecor1} />
            <View style={styles.welcomeDecor2} />
            <View style={styles.welcomeDecor3} />
            <Image source={require('@/assets/images/welcome card.png')} style={styles.welcomeRightImg} resizeMode="contain" />

            <View style={styles.welcomeRow}>
              <View style={styles.welcomeLeft}>
                <Text style={styles.welcomeGreet}>{greetingText},</Text>
                <Text style={styles.welcomeName}>{user?.first_name}! 👋</Text>
                <Text style={styles.welcomeMotivation}>Doing great! Keep Going, CPA!</Text>
              </View>
            </View>

            {daysToExam > 0 && (
              <TouchableOpacity style={styles.welcomeExamPill} activeOpacity={0.8} onPress={() => router.push('/(tabs)/calendar')}>
                <View style={styles.welcomeExamIcon}>
                  <Ionicons name="calendar" size={13} color="#fff" />
                </View>
                <Text style={styles.welcomeExamText}>{daysToExam} days until the CPA board exam</Text>
                <Ionicons name="chevron-forward" size={13} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            )}
          </LinearGradient>
        </Animated.View>

        {/* ── Subjects ── */}
        {subjects.length > 0 && (
          <View style={styles.subjectsSection}>
            <View style={[styles.sectionHeader, { paddingTop: 0, marginBottom: 8 }]}>
              <Text style={styles.sectionTitle}>Subjects</Text>
              <TouchableOpacity style={styles.viewAllRow} onPress={() => router.push('/(tabs)/subjects')}>
                <Text style={styles.viewAll}>View all</Text>
                <Ionicons name="chevron-forward" size={14} color={C.primary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={subjects}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={SUBJECT_CARD_W + 10}
              decelerationRate="fast"
              contentContainerStyle={{ paddingLeft: sp.md, paddingRight: sp.sm }}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item, index }) => (
                <AnimSubjectCard
                  item={item}
                  index={index}
                  onPress={() => router.push({ pathname: '/subject-detail', params: { subjectId: item.id, subjectCode: item.code, subjectName: item.name } })}
                />
              )}
            />
          </View>
        )}

        {/* ── Recommended for You ── */}
        {recommendations.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recommended for You</Text>
              <Ionicons name="sparkles" size={16} color={C.primary} />
            </View>
            <FlatList
              data={recommendations}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={RECOMMEND_CARD_W + 16}
              decelerationRate="fast"
              contentContainerStyle={{ paddingLeft: sp.md, paddingRight: sp.sm }}
              keyExtractor={(item) => item.id}
              renderItem={({ item, index }) => (
                <AnimRecommendCard
                  item={item}
                  index={index}
                  onPress={() => router.push({ pathname: '/(tabs)/quizzes', params: { subjectId: 1, subjectCode: item.subjectCode } })}
                />
              )}
            />
          </View>
        )}

        {/* ── Continue Learning ── */}
        <View style={styles.section}>
          <ContinueLearningCard
            readiness={d?.readiness ?? 0}
            points={d?.points ?? 0}
            streak={d?.streak ?? 0}
            onPress={() => router.push('/(tabs)/performance')}
          />
        </View>

        {/* ── Quick Stats Row ── */}
        <View style={styles.section}>
          <View style={styles.statsRow}>
            <Animated.View entering={FadeInUp.delay(500).springify()} style={styles.statCardWrap}>
              <View style={styles.statCard}>
                <View style={[styles.statIconCircle, { backgroundColor: '#E8ECF0' }]}>
                  <Ionicons name="help-circle" size={20} color="#A52020" />
                </View>
                <Text style={styles.statValue}>{d?.questions_attempted ?? 0}</Text>
                <Text style={styles.statLabel}>Questions</Text>
                <Text style={styles.statSub}>+{d?.questions_this_week ?? 0} this week</Text>
              </View>
            </Animated.View>
            <Animated.View entering={FadeInUp.delay(580).springify()} style={styles.statCardWrap}>
              <View style={styles.statCard}>
                <View style={[styles.statIconCircle, { backgroundColor: '#DDE3EA' }]}>
                  <Ionicons name="time" size={20} color="#7B1416" />
                </View>
                <Text style={styles.statValue}>{d?.study_hours ?? 0}h</Text>
                <Text style={styles.statLabel}>Study Time</Text>
                <Text style={styles.statSub}>+{d?.study_hours_week ?? 0}h this week</Text>
              </View>
            </Animated.View>
            <Animated.View entering={FadeInUp.delay(660).springify()} style={styles.statCardWrap}>
              <View style={styles.statCard}>
                <View style={[styles.statIconCircle, { backgroundColor: '#E8ECF0' }]}>
                  <Ionicons name="star" size={20} color="#8E1520" />
                </View>
                <Text style={styles.statValue}>{(d?.points ?? 0).toLocaleString()}</Text>
                <Text style={styles.statLabel}>Points</Text>
                <Text style={styles.statSub}>Keep going!</Text>
              </View>
            </Animated.View>
          </View>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ── Helpers ── */
function notifIcon(type: string): any {
  return type === 'review' ? 'calendar'
    : type === 'streak' ? 'flame'
    : type === 'achievement' ? 'trophy'
    : 'notifications';
}
function notifColor(type: string): string {
  return type === 'review' ? C.primary
    : type === 'streak' ? C.warning
    : type === 'achievement' ? C.success
    : C.muted;
}

function formatNotifTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr  = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24)  return `${diffHr}h ago`;
  if (diffDay < 7)  return `${diffDay}d ago`;

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatFullNotifTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const hrs = date.getHours();
  const mins = String(date.getMinutes()).padStart(2, '0');
  const ampm = hrs >= 12 ? 'PM' : 'AM';
  const h12 = hrs % 12 || 12;
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} at ${h12}:${mins} ${ampm}`;
}
/** Gradient ramp for a mastery badge — green when mastered, maroon mid-way,
 *  amber then red when the topic still needs work. */
function masteryRamp(pct: number) {
  if (pct >= 75) return grad.success;
  if (pct >= 50) return grad.brand;
  if (pct >= 25) return ['#8A6508', '#B8860B', '#E0AC2B'] as const;
  return grad.danger;
}

/* ── Search results ── */
function SearchResults({ query, subjects, topics, notes, weaknesses, onSubject, onTopic, onNote, onPage }: {
  query: string;
  subjects: SearchSubject[];
  topics: SearchTopic[];
  notes: SearchNote[];
  weaknesses: { topic: string; subject_code: string }[];
  onSubject: (sub: SearchSubject) => void;
  onTopic: (topic: SearchTopic) => void;
  onNote: (note: SearchNote) => void;
  onPage: (route: string) => void;
}) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return (
      <View style={srStyles.empty}>
        <Ionicons name="search" size={40} color="#D1D5DB" />
        <Text style={srStyles.emptyText}>Search across subjects, topics, pages, achievements, and more</Text>
      </View>
    );
  }

  const subHits  = subjects.filter(sub => sub.name.toLowerCase().includes(q) || sub.code.toLowerCase().includes(q));
  const topicHits = topics.filter(t => t.name.toLowerCase().includes(q) || t.subjectName.toLowerCase().includes(q) || t.subjectCode.toLowerCase().includes(q));
  const noteHits = notes.filter(n => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
  const pageHits = SEARCH_PAGES.filter(p => p.name.toLowerCase().includes(q) || p.keywords.some(k => k.includes(q)));
  const achHits  = SEARCH_ACHIEVEMENTS.filter(a => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q));
  const weakHits = weaknesses.filter(w => w.topic.toLowerCase().includes(q) || w.subject_code.toLowerCase().includes(q));

  type Row =
    | { kind: 'header'; key: string; label: string }
    | { kind: 'subject'; key: string; subject: SearchSubject }
    | { kind: 'topic'; key: string; topic: SearchTopic }
    | { kind: 'note'; key: string; note: SearchNote }
    | { kind: 'page'; key: string; page: SearchPage }
    | { kind: 'achievement'; key: string; achievement: SearchAch }
    | { kind: 'weakness'; key: string; weakness: { topic: string; subject_code: string } };

  const rows: Row[] = [];
  if (pageHits.length) {
    rows.push({ kind: 'header', key: 'h-page', label: 'Pages' });
    pageHits.forEach((p, i) => rows.push({ kind: 'page', key: `p${i}`, page: p }));
  }
  if (subHits.length) {
    rows.push({ kind: 'header', key: 'h-sub', label: 'Subjects' });
    subHits.forEach(sub => rows.push({ kind: 'subject', key: `s${sub.id}`, subject: sub }));
  }
  if (topicHits.length) {
    rows.push({ kind: 'header', key: 'h-topic', label: 'Topics' });
    topicHits.forEach((t, i) => rows.push({ kind: 'topic', key: `t${i}`, topic: t }));
  }
  if (achHits.length) {
    rows.push({ kind: 'header', key: 'h-ach', label: 'Achievements' });
    achHits.forEach((a, i) => rows.push({ kind: 'achievement', key: `a${i}`, achievement: a }));
  }
  if (noteHits.length) {
    rows.push({ kind: 'header', key: 'h-note', label: 'Notes' });
    noteHits.forEach(n => rows.push({ kind: 'note', key: `n${n.id}`, note: n }));
  }
  if (weakHits.length) {
    rows.push({ kind: 'header', key: 'h-weak', label: 'Weaknesses' });
    weakHits.forEach((w, i) => rows.push({ kind: 'weakness', key: `w${i}`, weakness: w }));
  }

  if (rows.length === 0) {
    return (
      <View style={srStyles.empty}>
        <Ionicons name="search" size={40} color="#D1D5DB" />
        <Text style={srStyles.emptyText}>No results for &quot;{query}&quot;</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.key}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: sp.md }}
      renderItem={({ item }) => {
        if (item.kind === 'header') return <Text style={srStyles.header}>{item.label}</Text>;
        if (item.kind === 'subject') {
          const sub = item.subject;
          return (
            <TouchableOpacity style={srStyles.row} onPress={() => onSubject(sub)}>
              <View style={[srStyles.icon, { backgroundColor: (sub.color || C.accent) + '20' }]}>
                <Text style={[srStyles.iconCode, { color: sub.color || C.accent }]}>{sub.code.slice(0, 3)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={srStyles.rowTitle}>{sub.name}</Text>
                <Text style={srStyles.rowSub}>Tap to start a quiz</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
            </TouchableOpacity>
          );
        }
        if (item.kind === 'topic') {
          const t = item.topic;
          return (
            <TouchableOpacity style={srStyles.row} onPress={() => onTopic(t)}>
              <View style={[srStyles.icon, { backgroundColor: (t.color || C.accent) + '20' }]}>
                <Ionicons name="git-branch" size={18} color={t.color || C.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={srStyles.rowTitle}>{t.name}</Text>
                <Text style={srStyles.rowSub}>{t.subjectCode} &middot; View materials &amp; quiz</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
            </TouchableOpacity>
          );
        }
        if (item.kind === 'page') {
          const p = item.page;
          return (
            <TouchableOpacity style={srStyles.row} onPress={() => onPage(p.route)}>
              <View style={[srStyles.icon, { backgroundColor: C.primary + '15' }]}>
                <Ionicons name={p.icon as any} size={18} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={srStyles.rowTitle}>{p.name}</Text>
                <Text style={srStyles.rowSub}>Go to {p.name}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
            </TouchableOpacity>
          );
        }
        if (item.kind === 'achievement') {
          const a = item.achievement;
          return (
            <TouchableOpacity style={srStyles.row} onPress={() => onPage('/achievements')}>
              <View style={[srStyles.icon, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="trophy" size={18} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={srStyles.rowTitle}>{a.name}</Text>
                <Text style={srStyles.rowSub}>{a.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
            </TouchableOpacity>
          );
        }
        if (item.kind === 'weakness') {
          const w = item.weakness;
          return (
            <TouchableOpacity style={srStyles.row} onPress={() => onPage('/(tabs)/performance')}>
              <View style={[srStyles.icon, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="warning" size={18} color="#DC2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={srStyles.rowTitle}>{w.topic}</Text>
                <Text style={srStyles.rowSub}>{w.subject_code} &middot; Needs practice</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
            </TouchableOpacity>
          );
        }
        return (
          <TouchableOpacity style={srStyles.row} onPress={() => onNote(item.note)}>
            <View style={[srStyles.icon, { backgroundColor: C.primary + '15' }]}>
              <Ionicons name="document-text" size={18} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={srStyles.rowTitle} numberOfLines={1}>{item.note.title}</Text>
              <Text style={srStyles.rowSub} numberOfLines={1}>{item.note.content}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
          </TouchableOpacity>
        );
      }}
    />
  );
}

/* ── Styles ── */
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  scroll: { paddingBottom: 24 },

  /* Header */
  header: {
    paddingHorizontal: sp.md,
    paddingTop: sp.sm,
    paddingBottom: sp.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wordmarkImg: {
    height: 18,
    width: 70,
  },
  logoImg: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  appName: {
    fontSize: 20,
    fontFamily: F.bold,
    color: C.primary,
    letterSpacing: 0.4,
    lineHeight: 24,
  },
  appTagline: {
    fontSize: 11,
    fontFamily: 'Poppins_400Regular_Italic',
    color: C.muted,
    marginTop: -2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hdrBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifDot: {
    position: 'absolute', top: 6, right: 6,
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: C.primary, borderWidth: 1.5, borderColor: C.card,
  },
  msgDot: {
    position: 'absolute', top: 6, right: 6,
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: C.accent, borderWidth: 1.5, borderColor: C.card,
  },
  avatarWrap: { position: 'relative' },
  avatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: C.primary + '30' },
  avatarFallback: { backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center' },
  avatarInitials: { color: C.white, fontSize: 13, fontFamily: F.bold },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#2E7D32', borderWidth: 1.5, borderColor: '#fff',
  },

  /* Menu */
  menuOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'flex-start', alignItems: 'flex-end',
    paddingTop: 72, paddingRight: 16,
  },
  menuCard: {
    backgroundColor: '#fff', borderRadius: 16, paddingVertical: 8,
    minWidth: 220,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14, shadowRadius: 16, elevation: 16,
  },
  menuUserRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  menuAvatar: { width: 38, height: 38, borderRadius: 19 },
  menuName: { fontSize: 14, fontFamily: F.semiBold, color: '#111827' },
  menuEmail: { fontSize: 11, fontFamily: F.regular, color: '#6B7280', marginTop: 1 },
  menuDivider: { height: 1, backgroundColor: '#F3F4F6' },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
  },
  menuItemText: { fontSize: 14, fontFamily: F.medium, color: '#374151' },

  /* Search */
  searchHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: sp.md, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F3F4F6', borderRadius: r.full, paddingHorizontal: 14, height: 40,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: F.regular, color: C.text, paddingVertical: 0 },
  searchCancel: { fontSize: 14, fontFamily: F.semiBold, color: C.primary },
  searchAllRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 12, paddingVertical: 11,
    borderRadius: 10, backgroundColor: 'rgba(165,32,32,0.05)',
    borderWidth: 1, borderColor: 'rgba(165,32,32,0.18)',
  },
  searchAllText: { flex: 1, fontSize: 13, fontFamily: F.semiBold, color: C.accent },

  /* Notifications */
  notifModalSafe: {
    flex: 1,
    backgroundColor: C.bg,
  },
  notifModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: sp.md,
    paddingVertical: sp.sm,
  },
  notifBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifModalTitle: {
    fontSize: 17,
    fontFamily: F.bold,
    color: C.text,
    flex: 1,
    textAlign: 'center',
  },
  notifMarkAll: {
    fontSize: 12,
    fontFamily: F.semiBold,
    color: C.primary,
  },
  notifDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginHorizontal: sp.md,
  },
  notifBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.primary + '0A',
    borderRadius: r.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.primary + '15',
  },
  notifBannerText: {
    fontSize: 12.5,
    fontFamily: F.semiBold,
    color: C.primary,
  },
  notifEmptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 60,
  },
  notifEmptyCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  notifEmptyTitle: {
    fontSize: 16,
    fontFamily: F.bold,
    color: C.text,
    marginTop: 8,
  },
  notifEmptySub: {
    fontSize: 13,
    fontFamily: F.regular,
    color: C.muted,
    textAlign: 'center',
    paddingHorizontal: 40,
    marginTop: 2,
  },
  notifListContent: {
    padding: sp.md,
    paddingBottom: 40,
  },
  notifFullRow: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  notifFullRowUnread: {
    backgroundColor: '#F1F4F7',
    borderWidth: 1.5,
    borderColor: C.primary + '18',
  },
  notifFullIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  notifFullIconInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifFullContent: {
    flex: 1,
  },
  notifFullTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  notifFullTitle: {
    fontSize: 13.5,
    fontFamily: F.semiBold,
    color: C.text,
    flex: 1,
  },
  notifFullBody: {
    fontSize: 12,
    fontFamily: F.regular,
    color: C.muted,
    marginTop: 3,
    lineHeight: 17,
  },
  notifFullBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  notifFullTime: {
    fontSize: 11,
    fontFamily: F.regular,
    color: '#B0B8C4',
  },
  notifUnreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.primary,
    marginLeft: 6,
  },
  /* Detail view */
  notifDetailScroll: {
    paddingBottom: 40,
  },
  notifDetailHero: {
    alignItems: 'center',
    paddingVertical: 32,
    marginHorizontal: sp.md,
    marginTop: 8,
    borderRadius: 24,
  },
  notifDetailIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifDetailBody: {
    paddingHorizontal: sp.md,
    marginTop: 20,
  },
  notifDetailTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#F3F4F6',
    borderRadius: r.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  notifDetailTypeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  notifDetailTypeText: {
    fontSize: 11,
    fontFamily: F.semiBold,
  },
  notifDetailTitle: {
    fontSize: 20,
    fontFamily: F.bold,
    color: C.text,
    lineHeight: 26,
  },
  notifDetailTime: {
    fontSize: 12,
    fontFamily: F.regular,
    color: '#9CA3AF',
    marginTop: 6,
  },
  notifDetailDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 18,
  },
  notifDetailMsg: {
    fontSize: 14,
    fontFamily: F.regular,
    color: '#4B5563',
    lineHeight: 22,
  },

  /* Welcome card */
  welcomeCard: {
    marginHorizontal: sp.md, marginTop: sp.md,
    borderRadius: 20,
    padding: 20,
    overflow: 'hidden',
  },
  welcomeDecor1: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -30, right: 50,
  },
  welcomeDecor2: {
    position: 'absolute', width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.08)',
    bottom: -15, right: 100,
  },
  welcomeDecor3: {
    position: 'absolute', width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    top: 20, left: -10,
  },
  welcomeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  welcomeLeft: {
    flex: 1,
    gap: 2,
  },
  welcomeGreet: {
    fontSize: 15,
    fontFamily: F.medium,
    color: 'rgba(255,255,255,0.70)',
  },
  welcomeName: {
    fontSize: 22,
    fontFamily: F.bold,
    color: '#fff',
    marginTop: 1,
  },
  welcomeMotivation: {
    fontSize: 12,
    fontFamily: F.regular,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 6,
    lineHeight: 17,
  },
  welcomeRightImg: {
    position: 'absolute',
    width: 110,
    height: 110,
    right: 6,
    top: '50%',
    marginTop: -55,
  },
  welcomeAvatar: {
    marginLeft: 12,
  },
  welcomeAvatarImg: {
    width: 52, height: 52, borderRadius: 26,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  welcomeAvatarFallback: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.20)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  welcomeAvatarText: {
    fontSize: 18, fontFamily: F.bold, color: '#fff',
  },
  welcomeExamPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: r.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 14,
  },
  welcomeExamIcon: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },
  welcomeExamText: {
    flex: 1,
    fontSize: 12,
    fontFamily: F.semiBold,
    color: 'rgba(255,255,255,0.90)',
  },

  /* Sections */
  section: { marginTop: 24 },
  subjectsSection: {
    marginTop: 12,
    marginHorizontal: 0,
    paddingVertical: 10,
  },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: sp.md, marginBottom: 14,
  },
  sectionTitle: { fontSize: 17, fontFamily: F.bold, color: C.text },
  viewAllRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewAll: { fontSize: 13, fontFamily: F.semiBold, color: C.primary },

  /* Subject cards */
  subjectCardWrap: {
    width: SUBJECT_CARD_W - 15,
    height: SUBJECT_CARD_H - 10,
    marginRight: 8,
    borderRadius: 22,
  },
  subjectCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 20,
    overflow: 'hidden',
  },
  subjectImg: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  subjectImgFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subjectCardBottom: {
    marginTop: 6,
    alignItems: 'center',
  },
  subjectName: {
    fontSize: 12,
    fontFamily: F.bold,
    color: C.text,
  },

  /* Recommendation cards */
  recommendCardWrap: {
    width: RECOMMEND_CARD_W,
    height: RECOMMEND_CARD_H,
    marginRight: 16,
    borderRadius: 24,
  },
  recommendCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.90)',
    borderRadius: 24,
    overflow: 'hidden',
  },
  recommendBody: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  recommendTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  recommendTitle: {
    fontSize: 16,
    fontFamily: F.bold,
    color: C.text,
    flex: 1,
    marginRight: 8,
  },
  recommendBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: r.full,
    overflow: 'hidden',
  },
  recommendBadgeText: {
    fontSize: 11,
    fontFamily: F.bold,
    color: C.white,
  },
  recommendSubject: {
    fontSize: 11,
    fontFamily: F.bold,
    color: C.muted,
    letterSpacing: 0.8,
    marginTop: 2,
  },
  recommendMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  recommendMetaText: {
    fontSize: 12,
    fontFamily: F.regular,
    color: C.muted,
  },
  recommendDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: C.light,
    marginHorizontal: 4,
  },
  recommendReason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: r.sm,
    overflow: 'hidden',
  },
  recommendReasonText: {
    fontSize: 11,
    fontFamily: F.medium,
    color: C.primary,
    flex: 1,
  },

  /* Continue Learning card */
  continueCardWrap: {
    marginHorizontal: sp.md,
    borderRadius: 24,
    overflow: 'hidden',
  },
  continueBlur: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  continueCard: {
    borderRadius: 24,
    padding: 20,
    overflow: 'hidden',
  },
  continueDecor1: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -40,
    right: 60,
  },
  continueDecor2: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.08)',
    bottom: -20,
    right: 30,
  },
  continueContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  continueLeft: { flex: 1, gap: 4 },
  continueTitle: {
    fontSize: 18,
    fontFamily: F.bold,
    color: '#fff',
  },
  continueSub: {
    fontSize: 12,
    fontFamily: F.regular,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 12,
  },
  continueStats: {
    flexDirection: 'row',
    gap: 16,
  },
  continueStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  continueStatText: {
    fontSize: 11,
    fontFamily: F.semiBold,
    color: 'rgba(255,255,255,0.9)',
  },
  continueRight: {
    alignItems: 'center',
    marginLeft: 16,
  },
  continueCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueCircleText: {
    fontSize: 18,
    fontFamily: F.extraBold,
    color: '#fff',
  },

  /* Stats row */
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: sp.md,
  },
  statCardWrap: {
    flex: 1,
    borderRadius: r.lg,
    overflow: 'hidden',
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: r.lg,
    padding: 14,
    alignItems: 'center',
    overflow: 'hidden',
  },
  statIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 18,
    fontFamily: F.extraBold,
    color: C.text,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: F.regular,
    color: C.muted,
    marginTop: 2,
  },
  statSub: {
    fontSize: 10,
    fontFamily: F.semiBold,
    color: C.muted,
    marginTop: 2,
  },
});

const srStyles = StyleSheet.create({
  header:    { fontSize: 12, fontFamily: F.bold, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: sp.sm, marginBottom: sp.xs },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: r.lg, padding: 12, marginBottom: 8 },
  icon:      { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  iconCode:  { fontSize: 11, fontFamily: F.bold },
  rowTitle:  { fontSize: 14, fontFamily: F.semiBold, color: C.text },
  rowSub:    { fontSize: 12, fontFamily: F.regular, color: C.muted, marginTop: 1 },
  empty:     { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: F.regular, color: '#9CA3AF' },
});
