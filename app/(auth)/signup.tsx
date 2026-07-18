import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Alert, Image, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/lib/context/auth-context';
import { C, sp, r } from '@/constants/cpace-theme';

const SH = Dimensions.get('window').height;

const F = {
  regular:   'Poppins_400Regular',
  medium:    'Poppins_500Medium',
  semiBold:  'Poppins_600SemiBold',
  bold:      'Poppins_700Bold',
  extraBold: 'Poppins_800ExtraBold',
} as const;

type Form = { firstName: string; lastName: string; email: string; password: string; confirm: string };

export default function SignupScreen() {
  const { signup } = useAuth();
  const router     = useRouter();
  const [form, setForm]       = useState<Form>({ firstName: '', lastName: '', email: '', password: '', confirm: '' });
  const [showPass, setShowPass]   = useState(false);
  const [showConf, setShowConf]   = useState(false);
  const [loading, setLoading]     = useState(false);

  const set = (key: keyof Form) => (val: string) => setForm(f => ({ ...f, [key]: val }));

  const handleSignup = async () => {
    const { firstName, lastName, email, password, confirm } = form;
    if (!firstName || !lastName || !email || !password) {
      Alert.alert('Required', 'Please fill in all fields.'); return;
    }
    if (password !== confirm) {
      Alert.alert('Mismatch', 'Passwords do not match.'); return;
    }
    if (password.length < 8) {
      Alert.alert('Too short', 'Password must be at least 8 characters.'); return;
    }
    setLoading(true);
    try {
      await signup(firstName, lastName, email.trim().toLowerCase(), password, confirm);
    } catch (err: any) {
      Alert.alert('Sign Up Failed', err.message || 'Could not create account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <LinearGradient
        colors={['#4A0A0C', C.primary, '#B52525']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.gradient}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* ── Brand section ── */}
            <View style={s.brand}>
              <TouchableOpacity onPress={() => router.back()} style={s.back}>
                <Ionicons name="arrow-back" size={22} color="#fff" />
              </TouchableOpacity>
              <Image source={require('@/assets/images/logo.png')} style={s.logo} resizeMode="contain" />
              <Text style={s.appName}>CPAce</Text>
              <Text style={s.tagline}>Join thousands of CPA reviewers</Text>
            </View>

            {/* ── White card ── */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Create Account</Text>
              <Text style={s.cardSub}>Fill in your details to get started</Text>

              {/* Name row */}
              <View style={s.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={s.label}>First Name</Text>
                  <View style={s.inputWrap}>
                    <TextInput
                      style={s.input}
                      value={form.firstName}
                      onChangeText={set('firstName')}
                      placeholder="Juan"
                      placeholderTextColor={C.light}
                      autoCapitalize="words"
                    />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Last Name</Text>
                  <View style={s.inputWrap}>
                    <TextInput
                      style={s.input}
                      value={form.lastName}
                      onChangeText={set('lastName')}
                      placeholder="dela Cruz"
                      placeholderTextColor={C.light}
                      autoCapitalize="words"
                    />
                  </View>
                </View>
              </View>

              {/* Email */}
              <Text style={s.label}>Email</Text>
              <View style={s.inputWrap}>
                <Ionicons name="mail-outline" size={18} color={C.muted} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  value={form.email}
                  onChangeText={set('email')}
                  placeholder="you@example.com"
                  placeholderTextColor={C.light}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              {/* Password */}
              <Text style={s.label}>Password</Text>
              <View style={s.inputWrap}>
                <Ionicons name="lock-closed-outline" size={18} color={C.muted} style={s.inputIcon} />
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  value={form.password}
                  onChangeText={set('password')}
                  placeholder="Min. 8 characters"
                  placeholderTextColor={C.light}
                  secureTextEntry={!showPass}
                />
                <TouchableOpacity onPress={() => setShowPass(v => !v)} style={s.eye}>
                  <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.muted} />
                </TouchableOpacity>
              </View>

              {/* Confirm Password */}
              <Text style={s.label}>Confirm Password</Text>
              <View style={s.inputWrap}>
                <Ionicons name="lock-closed-outline" size={18} color={C.muted} style={s.inputIcon} />
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  value={form.confirm}
                  onChangeText={set('confirm')}
                  placeholder="Repeat password"
                  placeholderTextColor={C.light}
                  secureTextEntry={!showConf}
                />
                <TouchableOpacity onPress={() => setShowConf(v => !v)} style={s.eye}>
                  <Ionicons name={showConf ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.muted} />
                </TouchableOpacity>
              </View>

              {/* Create Account button */}
              <TouchableOpacity onPress={handleSignup} disabled={loading} activeOpacity={0.85}>
                <LinearGradient
                  colors={['#4A0A0C', C.primary, '#B52525']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[s.btn, loading && s.btnOff]}
                >
                  {loading
                    ? <ActivityIndicator color={C.white} />
                    : <Text style={s.btnText}>Create Account</Text>}
                </LinearGradient>
              </TouchableOpacity>

              {/* Divider */}
              <View style={s.divider}>
                <View style={s.dividerLine} />
                <Text style={s.dividerText}>or sign up with</Text>
                <View style={s.dividerLine} />
              </View>

              {/* Social buttons */}
              <View style={s.socialRow}>
                <TouchableOpacity style={s.socialBtn} activeOpacity={0.75}
                  onPress={() => Alert.alert('Coming Soon', 'Google sign-up will be available soon.')}>
                  <Image source={{ uri: 'https://www.gstatic.com/images/branding/googleg/2x/googleg_standard_color_128dp.png' }} style={s.socialLogo} />
                  <Text style={s.socialText}>Google</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.socialBtn} activeOpacity={0.75}
                  onPress={() => Alert.alert('Coming Soon', 'Microsoft sign-up will be available soon.')}>
                  <Image source={{ uri: 'https://img.icons8.com/color/96/microsoft.png' }} style={s.socialLogo} />
                  <Text style={s.socialText}>Microsoft</Text>
                </TouchableOpacity>
              </View>

              {/* Sign in link */}
              <View style={s.linkRow}>
                <Text style={s.linkText}>Already have an account? </Text>
                <Link href="/(auth)/login">
                  <Text style={s.linkBold}>Sign In</Text>
                </Link>
              </View>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: '#4A0A0C' },
  gradient: { flex: 1 },
  scroll:   { flexGrow: 1 },

  // Brand
  brand:    { paddingTop: 24, paddingBottom: 28, paddingHorizontal: sp.lg, alignItems: 'center' },
  back:     { alignSelf: 'flex-start', marginBottom: 16, padding: 4 },
  logo:     { width: 60, height: 60, borderRadius: 14, marginBottom: 10 },
  appName:  { fontSize: 30, fontFamily: F.extraBold, color: '#fff', letterSpacing: 0.5 },
  tagline:  { fontSize: 13, fontFamily: F.regular,   color: 'rgba(255,255,255,0.70)', marginTop: 4 },

  // Card
  card:      {
    backgroundColor: '#fff',
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    flex: 1,
    paddingHorizontal: 24, paddingTop: 28, paddingBottom: 40,
  },
  cardTitle: { fontSize: 22, fontFamily: F.bold,    color: C.text },
  cardSub:   { fontSize: 13, fontFamily: F.regular, color: C.muted, marginTop: 2, marginBottom: 16 },

  // Labels & inputs
  row:       { flexDirection: 'row' },
  label:     { fontSize: 13, fontFamily: F.semiBold, color: C.text, marginBottom: 6, marginTop: 12 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F5F5F7', borderRadius: 12,
    borderWidth: 1, borderColor: '#EBEBEB',
    paddingHorizontal: 12,
  },
  inputIcon: { marginRight: 8 },
  input:     { flex: 1, paddingVertical: 12, fontSize: 14, fontFamily: F.regular, color: C.text },
  eye:       { padding: 4 },

  // Button
  btn:      { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  btnOff:   { opacity: 0.7 },
  btnText:  { color: '#fff', fontSize: 16, fontFamily: F.bold },

  // Divider
  divider:     { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E5E5E5' },
  dividerText: { fontSize: 12, fontFamily: F.regular, color: C.muted },

  // Social
  socialRow: { flexDirection: 'row', gap: 12 },
  socialBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 13, borderRadius: 12,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E5E5E5',
  },
  socialLogo: { width: 20, height: 20, resizeMode: 'contain' },
  socialText: { fontSize: 14, fontFamily: F.semiBold, color: C.text },

  // Link
  linkRow:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 22 },
  linkText: { fontSize: 14, fontFamily: F.regular, color: C.muted },
  linkBold: { fontSize: 14, fontFamily: F.bold,    color: C.accent },
});
