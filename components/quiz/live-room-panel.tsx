// Live Room UI: a header pill showing the student's current standing, a
// bottom sheet with the full roster + feed, and a floating toast stack for
// overtakes/streaks/rank changes. Pairs with the useLiveRoom hook.
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, sp, r, font } from '@/constants/cpace-theme';
import type { RoomRow, RoomStanding, RoomFeedItem, RoomToast } from '@/lib/liveRoom';

const TOAST_STYLE: Record<RoomToast['kind'], { bg: string; fg: string }> = {
  good: { bg: 'rgba(33,163,102,0.95)', fg: C.white },
  warn: { bg: 'rgba(232,145,11,0.95)', fg: C.white },
  fire: { bg: 'rgba(165,32,32,0.95)', fg: C.white },
};

export function LiveRoomToasts({ toasts }: { toasts: RoomToast[] }) {
  if (!toasts.length) return null;
  return (
    <View pointerEvents="none" style={st.wrap}>
      {toasts.map((t) => {
        const style = TOAST_STYLE[t.kind];
        return (
          <View key={t.id} style={[st.toast, { backgroundColor: style.bg }]}>
            <Ionicons name={t.icon as any} size={14} color={style.fg} />
            <Text style={[st.toastText, { color: style.fg }]} numberOfLines={1}>{t.text}</Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Persistent strip shown right on the quiz screen (not tucked behind a
 * modal) so the rivals racing you are visible the whole time you're
 * answering, not just when you tap in to check.
 */
export function LiveRoomStrip({ rows, onPress }: { rows: RoomRow[]; onPress: () => void }) {
  if (!rows.length) return null;
  const maxProgress = Math.max(1, ...rows.map((r) => r.progress));

  return (
    <TouchableOpacity style={sp_.wrap} onPress={onPress} activeOpacity={0.85}>
      <View style={sp_.head}>
        <Ionicons name="radio" size={12} color={C.primary} />
        <Text style={sp_.headText}>Live Room</Text>
        <Ionicons name="chevron-forward" size={13} color={C.light} />
      </View>
      <View style={sp_.lanes}>
        {rows.map((row) => {
          const pct = Math.round((row.progress / maxProgress) * 100);
          return (
            <View key={row.key} style={sp_.lane}>
              <View style={[sp_.avatar, row.you && sp_.avatarYou, { backgroundColor: row.color }]}>
                <Text style={sp_.avatarText}>{row.you ? 'Y' : row.name.charAt(0)}</Text>
              </View>
              <View style={sp_.laneBarBg}>
                <View style={[sp_.laneBarFill, { width: `${pct}%`, backgroundColor: row.color }]} />
              </View>
            </View>
          );
        })}
      </View>
    </TouchableOpacity>
  );
}

export function LiveRoomPill({ standing, streak, onPress }: { standing: RoomStanding; streak: number; onPress: () => void }) {
  return (
    <TouchableOpacity style={pl.pill} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name="radio" size={13} color={C.white} />
      <Text style={pl.text}>#{standing.place}</Text>
      {streak >= 3 && (
        <View style={pl.streakBadge}>
          <Ionicons name="flame" size={11} color="#ffd166" />
          <Text style={pl.streakText}>{streak}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function LiveRoomSheet({
  visible, onClose, rows, standing, streak, bestStreak, feed,
}: {
  visible: boolean;
  onClose: () => void;
  rows: RoomRow[];
  standing: RoomStanding;
  streak: number;
  bestStreak: number;
  feed: RoomFeedItem[];
}) {
  const maxProgress = Math.max(1, ...rows.map((r) => r.progress));
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={sh.safe}>
        <View style={sh.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={sh.close}>Close</Text>
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={sh.title}>Live Room</Text>
            <Text style={sh.subtitle}>#{standing.place} of {standing.total}</Text>
          </View>
          <View style={sh.streakChip}>
            <Ionicons name="flame" size={13} color={C.warning} />
            <Text style={sh.streakChipText}>{streak}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: sp.md }}>
          <Text style={sh.sectionLabel}>Roster</Text>
          {rows.map((row) => {
            const pct = Math.round((row.progress / maxProgress) * 100);
            return (
              <View key={row.key} style={[sh.row, row.you && sh.rowYou]}>
                <View style={[sh.avatar, { backgroundColor: row.color }]}>
                  <Text style={sh.avatarText}>{row.name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={sh.rowTop}>
                    <Text style={sh.rowName} numberOfLines={1}>
                      {row.name} <Text style={sh.rowTag}>· {row.tag}</Text>
                    </Text>
                    <Text style={sh.rowStat}>{row.progress}{row.correct ? ` · ${row.correct}✓` : ''}</Text>
                  </View>
                  <View style={sh.barBg}>
                    <View style={[sh.barFill, { width: `${pct}%`, backgroundColor: row.color }]} />
                  </View>
                </View>
              </View>
            );
          })}

          <Text style={[sh.sectionLabel, { marginTop: sp.lg }]}>Room feed</Text>
          {feed.length === 0 ? (
            <Text style={sh.emptyFeed}>Nothing yet — answer a question to get things moving.</Text>
          ) : (
            feed.map((f) => (
              <View key={f.id} style={sh.feedItem}>
                <Ionicons name={f.icon as any} size={14} color={C.muted} />
                <Text style={sh.feedText}>{f.text}</Text>
              </View>
            ))
          )}

          <Text style={sh.note}>
            Best streak this session: {bestStreak}. Live Room is cosmetic — it never affects your score.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const st = StyleSheet.create({
  wrap:      { position: 'absolute', top: sp.sm, left: sp.md, right: sp.md, gap: 6, zIndex: 50 },
  toast:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: sp.md, paddingVertical: 8, borderRadius: r.full, alignSelf: 'center' },
  toastText: { fontSize: 12.5, fontFamily: font.semiBold },
});

const sp_ = StyleSheet.create({
  wrap:        { backgroundColor: 'rgba(123,20,22,0.04)', borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: sp.md, paddingTop: 6, paddingBottom: sp.sm },
  head:        { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  headText:    { fontSize: 10.5, fontFamily: font.bold, color: C.primary, textTransform: 'uppercase', letterSpacing: 0.4, flex: 1 },
  lanes:       { flexDirection: 'row', gap: 6 },
  lane:        { flex: 1, alignItems: 'center', gap: 4 },
  avatar:      { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  avatarYou:   { borderWidth: 2, borderColor: C.primary },
  avatarText:  { color: C.white, fontSize: 10.5, fontFamily: font.bold },
  laneBarBg:   { width: '100%', height: 4, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden' },
  laneBarFill: { height: 4, borderRadius: 2 },
});

const pl = StyleSheet.create({
  pill:        { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: r.full },
  text:        { color: C.white, fontSize: 12.5, fontFamily: font.bold },
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 2 },
  streakText:  { color: '#ffd166', fontSize: 11.5, fontFamily: font.bold },
});

const sh = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: C.bg },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: sp.md, paddingVertical: sp.md, borderBottomWidth: 1, borderBottomColor: C.border },
  close:       { fontSize: 15, fontFamily: font.semiBold, color: C.accent },
  title:       { fontSize: 15, fontFamily: font.bold, color: C.text },
  subtitle:    { fontSize: 11.5, fontFamily: font.regular, color: C.muted, marginTop: 1 },
  streakChip:  { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(232,145,11,0.12)', paddingHorizontal: sp.sm, paddingVertical: 5, borderRadius: r.full },
  streakChipText: { fontSize: 12.5, fontFamily: font.bold, color: C.warning },
  sectionLabel:{ fontSize: 12, fontFamily: font.bold, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: sp.sm },
  row:         { flexDirection: 'row', alignItems: 'center', gap: sp.sm, backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.lg, padding: sp.sm, marginBottom: sp.xs, borderWidth: 1, borderColor: C.border },
  rowYou:      { borderColor: C.primary, backgroundColor: 'rgba(123,20,22,0.05)' },
  avatar:      { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  avatarText:  { color: C.white, fontSize: 13, fontFamily: font.bold },
  rowTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  rowName:     { fontSize: 13, fontFamily: font.semiBold, color: C.text, flex: 1, marginRight: sp.sm },
  rowTag:      { fontSize: 11, fontFamily: font.regular, color: C.muted },
  rowStat:     { fontSize: 12, fontFamily: font.bold, color: C.muted },
  barBg:       { height: 5, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' },
  barFill:     { height: 5, borderRadius: 3 },
  emptyFeed:   { fontSize: 12.5, fontFamily: font.regular, color: C.light, fontStyle: 'italic' },
  feedItem:    { flexDirection: 'row', alignItems: 'center', gap: sp.xs, paddingVertical: 5 },
  feedText:    { fontSize: 12.5, fontFamily: font.regular, color: C.muted, flex: 1 },
  note:        { fontSize: 11.5, fontFamily: font.regular, color: C.light, fontStyle: 'italic', marginTop: sp.lg, textAlign: 'center', lineHeight: 17 },
});
