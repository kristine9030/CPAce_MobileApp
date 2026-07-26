import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Image, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client, { MOCK_MODE } from '@/lib/api/client';
import { useAuth } from '@/lib/context/auth-context';
import { C, sp, r, sh, font, type } from '@/constants/cpace-theme';
import { ScreenHeader } from '@/components/ui/screen-header';
import { GradientButton, GradientFill } from '@/components/ui/gradient';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout, refreshUser } = useAuth();

  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName]   = useState(user?.last_name ?? '');
  const [examDate, setExamDate]   = useState(user?.exam_target_date ?? '');
  const [reminders, setReminders] = useState(true);
  const [saving, setSaving]       = useState(false);

  const initials = (user?.first_name?.[0] ?? '') + (user?.last_name?.[0] ?? '');

  const dirty =
    firstName !== (user?.first_name ?? '') ||
    lastName !== (user?.last_name ?? '') ||
    (examDate || '') !== (user?.exam_target_date ?? '');

  const save = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Required', 'Please enter your first and last name.');
      return;
    }
    if (examDate && !DATE_RE.test(examDate)) {
      Alert.alert('Invalid Date', 'Exam date must be in YYYY-MM-DD format (e.g. 2026-10-15).');
      return;
    }
    setSaving(true);
    try {
      await client.put('/profile', {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        exam_target_date: examDate || null,
      });
      await refreshUser();
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title="Settings" subtitle="Manage your profile & preferences" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={{ padding: sp.md, paddingBottom: sp.xl }}>

        {/* Profile card */}
        <View style={[s.cardWrap, s.profileRow]}>
          <View style={[s.card, s.profileRow]}>
          {user?.profile_photo ? (
            <Image source={{ uri: user.profile_photo }} style={s.avatar} />
          ) : (
            <GradientFill style={[s.avatar, s.avatarFallback]}>
              <Text style={s.avatarInitials}>{initials}</Text>
            </GradientFill>
          )}
          <View style={{ flex: 1, marginLeft: sp.md }}>
            <Text style={s.profileName}>{user?.first_name} {user?.last_name}</Text>
            <Text style={s.profileEmail}>{user?.email}</Text>
            <View style={s.statsRow}>
              <View style={s.statChip}>
                <Ionicons name="flame" size={12} color={C.warning} />
                <Text style={s.statChipText}>{user?.streak_days ?? 0} day streak</Text>
              </View>
              <View style={s.statChip}>
                <Ionicons name="star" size={12} color={C.purple} />
                <Text style={s.statChipText}>{(user?.total_points ?? 0).toLocaleString()} pts</Text>
              </View>
            </View>
          </View>
          </View>
        </View>

        {/* Edit profile */}
        <Text style={s.sectionTitle}>Profile</Text>
        <View style={[s.cardWrap]}>
          <View style={s.card}>
          <Text style={s.label}>First Name</Text>
          <TextInput
            style={s.input}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="First name"
            placeholderTextColor={C.light}
          />
          <Text style={s.label}>Last Name</Text>
          <TextInput
            style={s.input}
            value={lastName}
            onChangeText={setLastName}
            placeholder="Last name"
            placeholderTextColor={C.light}
          />
          <Text style={s.label}>Target Exam Date</Text>
          <TextInput
            style={s.input}
            value={examDate}
            onChangeText={setExamDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={C.light}
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
          />
          <Text style={s.hint}>Used for the &quot;Days to Exam&quot; countdown on your dashboard.</Text>

          <GradientButton
            radius={r.md}
            style={{ marginTop: sp.md }}
            contentStyle={s.saveBtn}
            onPress={save}
            disabled={!dirty}
            loading={saving}
          >
            <Ionicons name="save-outline" size={18} color={C.white} />
            <Text style={s.saveText}>Save Changes</Text>
          </GradientButton>
          </View>
        </View>

        {/* Preferences */}
        <Text style={s.sectionTitle}>Preferences</Text>
        <View style={[s.cardWrap]}>
          <View style={s.card}>
          <View style={s.prefRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.prefLabel}>Daily study reminders</Text>
              <Text style={s.prefSub}>Nudge me to keep my streak going</Text>
            </View>
            <Switch
              value={reminders}
              onValueChange={setReminders}
              trackColor={{ true: C.accent, false: C.border }}
              thumbColor={C.white}
            />
          </View>
          </View>
        </View>

        {/* Shortcuts */}
        <Text style={s.sectionTitle}>More</Text>
        <View style={[s.cardWrap, { paddingVertical: 0 }]}>
          <View style={[s.card, { paddingVertical: 0 }]}>
            <LinkRow icon="trophy-outline"   label="Achievements" onPress={() => router.push('/achievements')} />
            <LinkRow icon="time-outline"     label="Quiz History" onPress={() => router.push('/quiz/history')} />
            <LinkRow icon="calendar-outline" label="Study Calendar" onPress={() => router.push('/calendar')} last />
          </View>
        </View>

        {/* About */}
        <Text style={s.sectionTitle}>About</Text>
        <View style={[s.cardWrap]}>
          <View style={s.card}>
            <View style={s.aboutRow}>
              <Text style={s.aboutKey}>App</Text>
              <Text style={s.aboutVal}>CPAce — CPA Board Exam Reviewer</Text>
            </View>
            <View style={s.aboutRow}>
              <Text style={s.aboutKey}>Version</Text>
              <Text style={s.aboutVal}>1.0.0</Text>
            </View>
            <View style={[s.aboutRow, { borderBottomWidth: 0 }]}>
              <Text style={s.aboutKey}>Data source</Text>
              <Text style={s.aboutVal}>{MOCK_MODE ? 'Offline demo data' : 'Live server'}</Text>
            </View>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity style={s.logoutBtn} onPress={confirmLogout}>
          <Ionicons name="log-out-outline" size={20} color={C.danger} />
          <Text style={s.logoutText}>Log Out</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

function LinkRow({ icon, label, onPress, last }: { icon: any; label: string; onPress: () => void; last?: boolean }) {
  return (
    <TouchableOpacity style={[s.linkRow, last && { borderBottomWidth: 0 }]} onPress={onPress}>
      <Ionicons name={icon} size={20} color={C.accent} />
      <Text style={s.linkLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={C.light} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: C.bg },
  cardWrap:      { borderRadius: r.lg, marginBottom: sp.md, overflow: 'hidden', },
  card:           { backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: r.lg, padding: sp.md, overflow: 'hidden' },
  profileRow:     { flexDirection: 'row', alignItems: 'center' },
  avatar:         { width: 56, height: 56, borderRadius: 28 },
  avatarFallback: { justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarInitials: { color: C.white, fontSize: 20, fontFamily: font.bold },
  profileName:    { fontSize: 17, fontFamily: font.extraBold, color: C.text },
  profileEmail:   { fontSize: 13, fontFamily: font.regular, color: C.muted, marginTop: 1 },
  statsRow:       { flexDirection: 'row', gap: sp.sm, marginTop: sp.xs },
  statChip:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.bg, paddingHorizontal: sp.sm, paddingVertical: 3, borderRadius: r.full },
  statChipText:   { fontSize: 11, fontFamily: font.semiBold, color: C.muted },
  sectionTitle:   { ...type.sectionTitle, marginBottom: sp.sm, marginLeft: sp.xs, marginTop: sp.xs },
  label:          { fontSize: 13, fontFamily: font.semiBold, color: C.muted, marginBottom: 6, marginTop: sp.sm },
  input:          { backgroundColor: 'rgba(253,245,245,0.78)', borderRadius: r.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: sp.md, paddingVertical: 10, fontSize: 15, fontFamily: font.regular, color: C.text },
  hint:           { fontSize: 11, fontFamily: font.regular, color: C.light, marginTop: 6 },
  saveBtn:        { gap: sp.xs, paddingVertical: 13 },
  saveText:       { color: C.white, fontSize: 15, fontFamily: font.bold },
  prefRow:        { flexDirection: 'row', alignItems: 'center' },
  prefLabel:      { fontSize: 14, fontFamily: font.semiBold, color: C.text },
  prefSub:        { fontSize: 12, fontFamily: font.regular, color: C.muted, marginTop: 1 },
  linkRow:        { flexDirection: 'row', alignItems: 'center', gap: sp.sm, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  linkLabel:      { flex: 1, fontSize: 14, fontFamily: font.semiBold, color: C.text },
  aboutRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  aboutKey:       { fontSize: 13, fontFamily: font.regular, color: C.muted },
  aboutVal:       { fontSize: 13, fontFamily: font.semiBold, color: C.text, maxWidth: '65%', textAlign: 'right' },
  logoutBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp.xs, backgroundColor: C.danger + '15', paddingVertical: 14, borderRadius: r.lg, marginTop: sp.xs },
  logoutText:     { fontSize: 15, fontFamily: font.bold, color: C.danger },
});
