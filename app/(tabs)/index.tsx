import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, Image, Modal, Pressable,
  TextInput, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import client from '@/lib/api/client';
import { useAuth } from '@/lib/context/auth-context';
import { C, sp, r, sh } from '@/constants/cpace-theme';

const F = {
  regular:   'Poppins_400Regular',
  medium:    'Poppins_500Medium',
  semiBold:  'Poppins_600SemiBold',
  bold:      'Poppins_700Bold',
  extraBold: 'Poppins_800ExtraBold',
  black:     'Poppins_900Black',
} as const;

interface DashboardData {
  streak: number;
  points: number;
  days_to_exam: number | null;
  questions_attempted: number;
  questions_this_week: number;
  study_hours: number;
  study_hours_week: number;
  readiness: number;
  subject_mastery: Array<{ id: number; code: string; name: string; color: string; mastery: number }>;
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

export default function DashboardScreen() {
  const { user, logout }  = useAuth();
  const router            = useRouter();
  const [data, setData]         = useState<DashboardData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refresh, setRefresh]   = useState(false);
  const [avatarMenu, setAvatarMenu] = useState(false);

  // Notifications
  const [notifOpen, setNotifOpen]   = useState(false);
  const [notifs, setNotifs]         = useState<Notification[]>([]);
  const [unread, setUnread]         = useState(0);

  // Search
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery]           = useState('');
  const [allSubjects, setAllSubjects] = useState<SearchSubject[]>([]);
  const [allNotes, setAllNotes]       = useState<SearchNote[]>([]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefresh(true);
    try {
      const res = await client.get('/dashboard');
      setData(res.data);
    } catch {}
    try {
      const res = await client.get('/notifications');
      setNotifs(res.data.notifications ?? []);
      setUnread(res.data.unread_count ?? 0);
    } catch {}
    setLoading(false);
    setRefresh(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openSearch = async () => {
    setQuery('');
    setSearchOpen(true);
    try {
      const [subRes, noteRes] = await Promise.all([
        client.get('/subjects'),
        client.get('/review-notes'),
      ]);
      setAllSubjects(subRes.data.subjects ?? subRes.data ?? []);
      setAllNotes(noteRes.data.data ?? []);
    } catch {}
  };

  const markAllRead = async () => {
    try { await client.post('/notifications/read-all'); } catch {}
    setNotifs(n => n.map(x => ({ ...x, read: true })));
    setUnread(0);
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  const d = data!;
  const daysToExam = d?.days_to_exam ?? 0;

  const initials = (user?.first_name?.[0] ?? '') + (user?.last_name?.[0] ?? '');

  return (
    <SafeAreaView style={s.safe} edges={['top']}>

      {/* ── Header ── */}
      <LinearGradient
        colors={['#4A0A0C', C.primary, '#B52525']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={s.header}
      >
        {/* Left: logo + wordmark */}
        <View style={s.headerLeft}>
          <Image source={require('@/assets/images/logo.png')} style={s.logoImg} resizeMode="contain" />
          <Text style={s.appName}>CPAce</Text>
        </View>

        {/* Right: search, bell, avatar */}
        <View style={s.headerRight}>
          <TouchableOpacity style={s.hdrBtn} onPress={openSearch}>
            <Ionicons name="search" size={17} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity style={s.hdrBtn} onPress={() => setNotifOpen(true)}>
            <Ionicons name="notifications" size={17} color="#fff" />
            {unread > 0 && <View style={s.notifDot} />}
          </TouchableOpacity>

          <TouchableOpacity style={s.avatarWrap} activeOpacity={0.8} onPress={() => setAvatarMenu(v => !v)}>
            {user?.profile_photo ? (
              <Image source={{ uri: user.profile_photo }} style={s.avatar} />
            ) : (
              <View style={[s.avatar, s.avatarFallback]}>
                <Text style={s.avatarInitials}>{initials}</Text>
              </View>
            )}
            <View style={s.onlineDot} />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* ── Avatar dropdown ── */}
      <Modal transparent visible={avatarMenu} animationType="fade" onRequestClose={() => setAvatarMenu(false)}>
        <Pressable style={s.menuOverlay} onPress={() => setAvatarMenu(false)}>
          <Pressable style={s.menuCard}>
            {/* user info row */}
            <View style={s.menuUserRow}>
              {user?.profile_photo ? (
                <Image source={{ uri: user.profile_photo }} style={s.menuAvatar} />
              ) : (
                <View style={[s.menuAvatar, s.avatarFallback]}>
                  <Text style={[s.avatarInitials, { fontSize: 14 }]}>{initials}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.menuName}>{user?.first_name} {user?.last_name}</Text>
                <Text style={s.menuEmail}>{user?.email}</Text>
              </View>
            </View>

            <View style={s.menuDivider} />

            <TouchableOpacity
              style={s.menuItem}
              onPress={() => { setAvatarMenu(false); router.push('/settings' as any); }}
            >
              <Ionicons name="settings-outline" size={18} color="#374151" />
              <Text style={s.menuItemText}>Settings</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.menuItem}
              onPress={async () => { setAvatarMenu(false); await logout(); }}
            >
              <Ionicons name="log-out-outline" size={18} color="#EF4444" />
              <Text style={[s.menuItemText, { color: '#EF4444' }]}>Log out</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Search modal ── */}
      <Modal visible={searchOpen} animationType="slide" onRequestClose={() => setSearchOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F5F5' }} edges={['top']}>
          <View style={s.searchHeader}>
            <View style={s.searchBox}>
              <Ionicons name="search" size={16} color="#9CA3AF" />
              <TextInput
                style={s.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search subjects and notes…"
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
              <Text style={s.searchCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <SearchResults
            query={query}
            subjects={allSubjects}
            notes={allNotes}
            onSubject={(sub) => {
              setSearchOpen(false);
              router.push({ pathname: '/(tabs)/quizzes', params: { subjectId: sub.id, subjectCode: sub.code } });
            }}
            onNote={() => {
              setSearchOpen(false);
              router.push('/(tabs)/notes');
            }}
          />
        </SafeAreaView>
      </Modal>

      {/* ── Notifications modal ── */}
      <Modal transparent visible={notifOpen} animationType="fade" onRequestClose={() => setNotifOpen(false)}>
        <Pressable style={s.menuOverlay} onPress={() => setNotifOpen(false)}>
          <Pressable style={[s.menuCard, { minWidth: 300, maxWidth: 340 }]}>
            <View style={s.notifHeader}>
              <Text style={s.notifTitle}>Notifications</Text>
              {unread > 0 && (
                <TouchableOpacity onPress={markAllRead}>
                  <Text style={s.notifMarkAll}>Mark all read</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={s.menuDivider} />
            {notifs.length === 0 ? (
              <Text style={s.notifEmpty}>You're all caught up! 🎉</Text>
            ) : notifs.map((n) => (
              <TouchableOpacity
                key={n.id}
                style={[s.notifRow, !n.read && s.notifRowUnread]}
                onPress={() => {
                  setNotifOpen(false);
                  if (n.type === 'review') router.push('/calendar');
                  else if (n.type === 'achievement') router.push('/achievements');
                }}
              >
                <View style={[s.notifIcon, { backgroundColor: notifColor(n.type) + '20' }]}>
                  <Ionicons name={notifIcon(n.type)} size={16} color={notifColor(n.type)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.notifRowTitle}>{n.title}</Text>
                  <Text style={s.notifRowBody} numberOfLines={2}>{n.body}</Text>
                </View>
                {!n.read && <View style={s.notifUnreadDot} />}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl refreshing={refresh} onRefresh={() => load(true)} tintColor={C.accent} />
        }
      >

        {/* ── Greeting + Days to Exam (combined) ── */}
        <LinearGradient
          colors={['#4A0A0C', C.primary, '#B52525']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[s.examCard, sh.md]}
        >
          {/* Decorative circles */}
          <View style={s.decorCircleLg} />
          <View style={s.decorCircleSm} />

          {/* Left: greeting + exam countdown */}
          <View style={s.examLeft}>
            <Text style={s.greetHello}>Hello, {user?.first_name}! 👋</Text>
            <Text style={s.greetSub}>Keep up the great work!</Text>
            <View style={s.examRow}>
              <View style={s.examIconBox}>
                <Ionicons name="calendar" size={16} color="#fff" />
              </View>
              <View>
                <Text style={s.examLabel}>DAYS TO EXAM</Text>
                <Text style={s.examDays}>{daysToExam} days</Text>
              </View>
            </View>
          </View>
          {/* Right: calendar illustration */}
          <CalendarIllustration />
        </LinearGradient>

        {/* ── Your Progress ── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Your Progress</Text>
            <TouchableOpacity style={s.viewAllRow} onPress={() => router.push('/(tabs)/performance')}>
              <Text style={s.viewAll}>View all</Text>
              <Ionicons name="chevron-forward" size={14} color={C.accent} />
            </TouchableOpacity>
          </View>

          <View style={s.progressGrid}>
            <ProgressCard
              icon="flame"       iconColor={C.warning}  value={`${d?.streak ?? 0}`}
              label="Day Streak" badge="Keep it up!"    badgeColor={C.warning} badgeType="pill"
            />
            <ProgressCard
              icon="star"        iconColor={C.purple}   value={(d?.points ?? 0).toLocaleString()}
              label="Points"     badge="Great progress!" badgeColor={C.purple}  badgeType="pill"
            />
            <ProgressCard
              icon="checkmark-circle" iconColor={C.success} value={`${d?.readiness ?? 0}%`}
              label="Board Ready"     badge="On track!"      badgeColor={C.success} badgeType="pill"
            />
            <ProgressCard
              icon="calendar"      iconColor={C.accent}  value={`${daysToExam}`}
              label="Days to Exam" badge="Stay focused!" badgeColor={C.accent} badgeType="pill"
            />
            <ProgressCard
              icon="help-circle"  iconColor="#2979FF"  value={`${d?.questions_attempted ?? 0}`}
              label="Questions"   badge={`+${d?.questions_this_week ?? 0} this week`}
              badgeColor="#2979FF" badgeType="text"
            />
            <ProgressCard
              icon="time"         iconColor={C.warning}  value={`${d?.study_hours ?? 0}h`}
              label="Study Time"  badge={`+${d?.study_hours_week ?? 0}h this week`}
              badgeColor={C.warning} badgeType="text"
            />
          </View>
        </View>

        {/* ── Subject Mastery ── */}
        {(d?.subject_mastery?.length > 0) && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Subject Mastery</Text>
              <TouchableOpacity style={s.viewAllRow} onPress={() => router.push('/(tabs)/subjects')}>
                <Text style={s.viewAll}>View details</Text>
                <Ionicons name="chevron-forward" size={14} color={C.accent} />
              </TouchableOpacity>
            </View>
            <View style={[s.card, sh.sm]}>
              {d.subject_mastery.map((sub) => (
                <View key={sub.id} style={s.masteryRow}>
                  <Text style={s.masteryCode}>{sub.code}</Text>
                  <View style={s.masteryBg}>
                    <View
                      style={[s.masteryFill, {
                        width: `${sub.mastery}%` as any,
                        backgroundColor: sub.color || C.accent,
                      }]}
                    />
                  </View>
                  <Text style={s.masteryPct}>{sub.mastery}%</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Quick Access ── */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { marginBottom: 12 }]}>Quick Access</Text>
          <View style={s.quickRow}>
            <QuickItem icon="document-text"       label="Notes"        iconColor={C.accent}  bg="#FFF0F0" onPress={() => router.push('/(tabs)/notes')} />
            <QuickItem icon="flash"               label="Quizzes"      iconColor={C.accent}  bg="#FFF0F0" onPress={() => router.push('/(tabs)/quizzes')} />
            <QuickItem icon="book-outline"        label="Subjects"     iconColor="#374151"   bg="#F3F4F6" onPress={() => router.push('/(tabs)/subjects')} />
            <QuickItem icon="trophy"              label="Achievements" iconColor={C.warning} bg="#FFF8E1" onPress={() => router.push('/achievements')} />
            <QuickItem icon="calendar"            label="Calendar"     iconColor={C.accent}  bg="#FFF0F0" onPress={() => router.push('/calendar')} />
            <QuickItem icon="time"                label="History"      iconColor="#6B7280"   bg="#F3F4F6" onPress={() => router.push('/quiz/history')} />
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Notification helpers ──

function notifIcon(type: string): any {
  return type === 'review' ? 'calendar' : type === 'streak' ? 'flame' : type === 'achievement' ? 'trophy' : 'notifications';
}
function notifColor(type: string): string {
  return type === 'review' ? C.accent : type === 'streak' ? C.warning : type === 'achievement' ? C.success : C.muted;
}

// ── Search results ──

function SearchResults({ query, subjects, notes, onSubject, onNote }: {
  query: string;
  subjects: SearchSubject[];
  notes: SearchNote[];
  onSubject: (sub: SearchSubject) => void;
  onNote: (note: SearchNote) => void;
}) {
  const q = query.trim().toLowerCase();
  const subHits  = q ? subjects.filter(sub => sub.name.toLowerCase().includes(q) || sub.code.toLowerCase().includes(q)) : subjects;
  const noteHits = q ? notes.filter(n => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)) : [];

  type Row =
    | { kind: 'header'; key: string; label: string }
    | { kind: 'subject'; key: string; subject: SearchSubject }
    | { kind: 'note'; key: string; note: SearchNote };

  const rows: Row[] = [];
  if (subHits.length) {
    rows.push({ kind: 'header', key: 'h-sub', label: 'Subjects' });
    subHits.forEach(sub => rows.push({ kind: 'subject', key: `s${sub.id}`, subject: sub }));
  }
  if (noteHits.length) {
    rows.push({ kind: 'header', key: 'h-note', label: 'Notes' });
    noteHits.forEach(n => rows.push({ kind: 'note', key: `n${n.id}`, note: n }));
  }

  if (rows.length === 0) {
    return (
      <View style={sr.empty}>
        <Ionicons name="search" size={40} color="#D1D5DB" />
        <Text style={sr.emptyText}>No results for "{query}"</Text>
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
        if (item.kind === 'header') return <Text style={sr.header}>{item.label}</Text>;
        if (item.kind === 'subject') {
          const sub = item.subject;
          return (
            <TouchableOpacity style={sr.row} onPress={() => onSubject(sub)}>
              <View style={[sr.icon, { backgroundColor: (sub.color || C.accent) + '20' }]}>
                <Text style={[sr.iconCode, { color: sub.color || C.accent }]}>{sub.code.slice(0, 3)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={sr.rowTitle}>{sub.name}</Text>
                <Text style={sr.rowSub}>Tap to start a quiz</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
            </TouchableOpacity>
          );
        }
        return (
          <TouchableOpacity style={sr.row} onPress={() => onNote(item.note)}>
            <View style={[sr.icon, { backgroundColor: '#FFF0F0' }]}>
              <Ionicons name="document-text" size={18} color={C.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={sr.rowTitle} numberOfLines={1}>{item.note.title}</Text>
              <Text style={sr.rowSub} numberOfLines={1}>{item.note.content}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
          </TouchableOpacity>
        );
      }}
    />
  );
}

const sr = StyleSheet.create({
  header:    { fontSize: 12, fontFamily: F.bold, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: sp.sm, marginBottom: sp.xs },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: r.lg, padding: 12, marginBottom: 8 },
  icon:      { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  iconCode:  { fontSize: 11, fontFamily: F.bold },
  rowTitle:  { fontSize: 14, fontFamily: F.semiBold, color: C.text },
  rowSub:    { fontSize: 12, fontFamily: F.regular, color: C.muted, marginTop: 1 },
  empty:     { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: F.regular, color: '#9CA3AF' },
});

// ── Calendar illustration ──

function CalendarIllustration() {
  return (
    <View style={cal.wrap}>
      <View style={cal.frame}>
        <View style={cal.ringsRow}>
          <View style={cal.ring} />
          <View style={cal.ring} />
        </View>
        <View style={cal.redTop} />
        <View style={cal.grid}>
          {Array.from({ length: 18 }).map((_, i) => (
            <View key={i} style={cal.cell} />
          ))}
        </View>
      </View>
      <View style={cal.checkBadge}>
        <Ionicons name="checkmark" size={15} color="#fff" />
      </View>
    </View>
  );
}

const cal = StyleSheet.create({
  wrap:       { width: 82, height: 88, position: 'relative', marginLeft: sp.sm },
  frame:      { width: 76, height: 80, backgroundColor: '#f9f9f9', borderRadius: 10, borderWidth: 1.5, borderColor: '#E0E0E0', overflow: 'visible' },
  ringsRow:   { position: 'absolute', top: -8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-evenly' },
  ring:       { width: 8, height: 14, borderRadius: 4, backgroundColor: '#444' },
  redTop:     { height: 20, backgroundColor: C.primary, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  grid:       { flexDirection: 'row', flexWrap: 'wrap', padding: 5, gap: 3 },
  cell:       { width: 11, height: 9, backgroundColor: '#DCDCDC', borderRadius: 2 },
  checkBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: C.success,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2.5, borderColor: '#fff',
  },
});

// ── Progress card ──

type BadgeType = 'pill' | 'text';

function ProgressCard({
  icon, iconColor, value, label, badge, badgeColor, badgeType,
}: {
  icon: any; iconColor: string; value: string; label: string;
  badge: string; badgeColor: string; badgeType: BadgeType;
}) {
  return (
    <View style={pc.card}>
      <View style={[pc.iconCircle, { backgroundColor: iconColor + '22' }]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <Text style={pc.value}>{value}</Text>
      <Text style={pc.label}>{label}</Text>
      {badgeType === 'pill' ? (
        <View style={[pc.pill, { backgroundColor: badgeColor + '18' }]}>
          <Text style={[pc.pillText, { color: badgeColor }]}>{badge}</Text>
        </View>
      ) : (
        <Text style={[pc.subText, { color: badgeColor }]}>{badge}</Text>
      )}
    </View>
  );
}

const pc = StyleSheet.create({
  card:       { flex: 1, backgroundColor: C.card, borderRadius: r.lg, padding: 12, alignItems: 'center', minWidth: '30%', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2, elevation: 1 },
  iconCircle: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  value:      { fontSize: 22, fontFamily: F.extraBold, color: C.text, marginBottom: 1 },
  label:      { fontSize: 11, fontFamily: F.regular,   color: C.muted, marginBottom: 8, textAlign: 'center' },
  pill:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: r.full },
  pillText:   { fontSize: 10, fontFamily: F.semiBold },
  subText:    { fontSize: 10, fontFamily: F.semiBold, textAlign: 'center' },
});

// ── Quick access item ──

function QuickItem({ icon, label, iconColor, bg, onPress }: {
  icon: any; label: string; iconColor: string; bg: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={qi.item} onPress={onPress}>
      <View style={[qi.circle, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <Text style={qi.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const qi = StyleSheet.create({
  item:   { alignItems: 'center', flex: 1 },
  circle: { width: 54, height: 54, borderRadius: 27, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  label:  { fontSize: 10, fontFamily: F.medium, color: C.text, textAlign: 'center' },
});

// ── Main styles ──

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5' },
  scroll: { paddingBottom: 28 },

  // ── Header ──
  header: {
    paddingHorizontal: 10,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoImg: {
    width: 32,
    height: 32,
    borderRadius: 6,
  },
  appName: {
    fontSize: 20,
    fontFamily: F.extraBold,
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hdrBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.30)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifDot: {
    position: 'absolute', top: 7, right: 7,
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: '#EF4444', borderWidth: 1.5, borderColor: '#fff',
  },
  avatarWrap:     { position: 'relative' },
  avatar:         { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.50)' },
  avatarFallback: { backgroundColor: '#5C0F11', justifyContent: 'center', alignItems: 'center' },
  avatarInitials: { color: C.white, fontSize: 13, fontFamily: F.bold },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#22C55E', borderWidth: 1.5, borderColor: '#fff',
  },

  // ── Avatar dropdown menu ──
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 72,
    paddingRight: 16,
  },
  menuCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 0,
    minWidth: 220,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 16,
  },
  menuUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuAvatar:   { width: 38, height: 38, borderRadius: 19 },
  menuName:     { fontSize: 14, fontFamily: F.semiBold, color: '#111827' },
  menuEmail:    { fontSize: 11, fontFamily: F.regular,  color: '#6B7280', marginTop: 1 },
  menuDivider:  { height: 1, backgroundColor: '#F3F4F6', marginHorizontal: 0 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  menuItemText: { fontSize: 14, fontFamily: F.medium, color: '#374151' },

  // ── Search modal ──
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: sp.md,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: r.full,
    paddingHorizontal: 14,
    height: 40,
  },
  searchInput:  { flex: 1, fontSize: 14, fontFamily: F.regular, color: C.text, paddingVertical: 0 },
  searchCancel: { fontSize: 14, fontFamily: F.semiBold, color: C.accent },

  // ── Notifications modal ──
  notifHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  notifTitle:     { fontSize: 15, fontFamily: F.bold, color: '#111827' },
  notifMarkAll:   { fontSize: 12, fontFamily: F.semiBold, color: C.accent },
  notifEmpty:     { fontSize: 13, fontFamily: F.regular, color: '#6B7280', textAlign: 'center', paddingVertical: 24 },
  notifRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  notifRowUnread: { backgroundColor: '#FFF7F7' },
  notifIcon:      { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  notifRowTitle:  { fontSize: 13, fontFamily: F.semiBold, color: '#111827' },
  notifRowBody:   { fontSize: 11.5, fontFamily: F.regular, color: '#6B7280', marginTop: 1 },
  notifUnreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },

  // ── Combined greeting + exam card ──
  examCard: {
    borderRadius: r.lg,
    marginHorizontal: sp.md, marginTop: sp.md,
    paddingVertical: sp.md, paddingHorizontal: sp.md,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  decorCircleLg: {
    position: 'absolute', width: 130, height: 130, borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -40, right: 60,
  },
  decorCircleSm: {
    position: 'absolute', width: 70, height: 70, borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.10)',
    bottom: -20, right: 20,
  },
  examLeft:    { flex: 1, gap: 4, paddingRight: 12 },
  greetHello:  { fontSize: 16, fontFamily: F.bold,    color: '#fff' },
  greetSub:    { fontSize: 11, fontFamily: F.regular, color: 'rgba(255,255,255,0.80)' },
  examRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  examIconBox: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.20)', justifyContent: 'center', alignItems: 'center' },
  examLabel:   { fontSize: 9,  fontFamily: F.bold,      color: 'rgba(255,255,255,0.70)', letterSpacing: 0.8 },
  examDays:    { fontSize: 17, fontFamily: F.extraBold, color: '#fff' },

  // ── Sections ──
  section:       { paddingHorizontal: sp.md, marginTop: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle:  { fontSize: 16, fontFamily: F.bold, color: C.text },
  viewAllRow:    { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewAll:       { fontSize: 13, fontFamily: F.semiBold, color: C.accent },
  progressGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  // ── Subject mastery ──
  card:        { backgroundColor: C.card, borderRadius: r.lg, padding: sp.md },
  masteryRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  masteryCode: { width: 44, fontSize: 12, fontFamily: F.bold, color: C.muted },
  masteryBg:   { flex: 1, height: 8, backgroundColor: '#EDD8D8', borderRadius: 4, marginHorizontal: 8, overflow: 'hidden' },
  masteryFill: { height: 8, borderRadius: 4 },
  masteryPct:  { width: 36, fontSize: 12, fontFamily: F.bold, color: C.text, textAlign: 'right' },

  // ── Quick access ──
  quickRow: { flexDirection: 'row', justifyContent: 'space-between' },
});
