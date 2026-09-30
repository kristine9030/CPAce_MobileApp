import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Image, Switch, ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import client, { MOCK_MODE } from '@/lib/api/client';
import { useAuth } from '@/lib/context/auth-context';
import { C, sp, r, font, type } from '@/constants/cpace-theme';
import { ScreenHeader } from '@/components/ui/screen-header';
import { GradientButton } from '@/components/ui/gradient';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const AVATAR_COLORS = [
  '#8E1B1F', '#C6382D', '#2864DC', '#13958C', '#079669',
  '#7738E8', '#D4266C', '#DD7300', '#213F64', '#4B5A70',
];

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout, refreshUser } = useAuth();

  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName]   = useState(user?.last_name ?? '');
  const [examDate, setExamDate]   = useState(user?.exam_target_date ?? '');
  const [avatarColor, setAvatarColor] = useState(user?.avatar_color ?? AVATAR_COLORS[0]);
  const [reminders, setReminders] = useState(true);
  const [saving, setSaving]       = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const initials = (user?.first_name?.[0] ?? '') + (user?.last_name?.[0] ?? '');

  const dirty =
    firstName !== (user?.first_name ?? '') ||
    lastName !== (user?.last_name ?? '') ||
    (examDate || '') !== (user?.exam_target_date ?? '') ||
    avatarColor !== (user?.avatar_color ?? AVATAR_COLORS[0]);

  const chooseProfilePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Please allow photo access to choose a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    const form = new FormData();
    if (asset.file) {
      form.append('photo', asset.file);
    } else {
      const extension = asset.fileName?.split('.').pop()?.toLowerCase() || 'jpg';
      form.append('photo', {
        uri: asset.uri,
        name: asset.fileName || `profile-photo.${extension}`,
        type: asset.mimeType || (extension === 'png' ? 'image/png' : 'image/jpeg'),
      } as any);
    }

    setPhotoBusy(true);
    try {
      await client.post('/profile/photo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await refreshUser();
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Could not upload your profile photo.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const removeProfilePhoto = () => {
    Alert.alert('Remove Photo', 'Use your initials and selected avatar color instead?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setPhotoBusy(true);
          try {
            await client.delete('/profile/photo');
            await refreshUser();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Could not remove your profile photo.');
          } finally {
            setPhotoBusy(false);
          }
        },
      },
    ]);
  };

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
        avatar_color: avatarColor,
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
            <View style={[s.avatar, s.avatarFallback, { backgroundColor: avatarColor }]}>
              <Text style={s.avatarInitials}>{initials}</Text>
            </View>
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
          <View style={s.avatarEditorRow}>
            {user?.profile_photo ? (
              <Image source={{ uri: user.profile_photo }} style={s.editorAvatar} />
            ) : (
              <View style={[s.editorAvatar, s.avatarFallback, { backgroundColor: avatarColor }]}>
                <Text style={s.editorInitials}>{initials}</Text>
              </View>
            )}
            <View style={s.photoActions}>
              <TouchableOpacity
                style={s.photoButton}
                onPress={chooseProfilePhoto}
                disabled={photoBusy}
                activeOpacity={0.75}
              >
                {photoBusy ? (
                  <ActivityIndicator size="small" color={C.primary} />
                ) : (
                  <Ionicons name="camera" size={17} color={C.primary} />
                )}
                <Text style={s.photoButtonText}>{user?.profile_photo ? 'Change photo' : 'Upload photo'}</Text>
              </TouchableOpacity>
              {user?.profile_photo && (
                <TouchableOpacity onPress={removeProfilePhoto} disabled={photoBusy}>
                  <Text style={s.removePhotoText}>Remove photo</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {!user?.profile_photo && (
            <View style={s.colorSection}>
              <Text style={s.colorLabel}>Avatar color <Text style={s.colorHint}>(used when there&apos;s no photo)</Text></Text>
              <View style={s.colorPalette}>
                {AVATAR_COLORS.map(color => (
                  <TouchableOpacity
                    key={color}
                    style={[s.colorChoice, { backgroundColor: color }]}
                    onPress={() => setAvatarColor(color)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: avatarColor === color }}
                    accessibilityLabel={`Use avatar color ${color}`}
                  >
                    {avatarColor === color && <Ionicons name="checkmark" size={20} color={C.white} />}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

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
  avatarEditorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: sp.md },
  editorAvatar:    { width: 80, height: 80, borderRadius: 20 },
  editorInitials:  { color: C.white, fontSize: 24, fontFamily: font.bold },
  photoActions:    { marginLeft: sp.md, alignItems: 'flex-start', gap: 8 },
  photoButton:     { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: C.primary, borderRadius: r.md, paddingHorizontal: 16 },
  photoButtonText: { color: C.primary, fontSize: 14, fontFamily: font.semiBold },
  removePhotoText: { color: C.danger, fontSize: 12, fontFamily: font.semiBold },
  colorSection:    { marginBottom: sp.md },
  colorLabel:      { fontSize: 13, fontFamily: font.semiBold, color: C.muted, marginBottom: 10 },
  colorHint:       { fontFamily: font.regular, color: C.light },
  colorPalette:    { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  colorChoice:     { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
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
