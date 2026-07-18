import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Alert, Image, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
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

export default function LoginScreen() {
  const { login }         = useAuth();
  const [email, setEmail] = useState('');
  const [pass, setPass]   = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !pass) {
      Alert.alert('Required', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), pass);
    } catch (err: any) {
      Alert.alert('Login Failed', err.message || 'Invalid credentials.');
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
              <Image source={require('@/assets/images/logo.png')} style={s.logo} resizeMode="contain" />
              <Text style={s.appName}>CPAce</Text>
              <Text style={s.tagline}>CPA Review · Adaptive Learning</Text>
            </View>

            {/* ── White card ── */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Welcome back!</Text>
              <Text style={s.cardSub}>Sign in to continue your review</Text>

              {/* Email */}
              <Text style={s.label}>Email</Text>
              <View style={s.inputWrap}>
                <Ionicons name="mail-outline" size={18} color={C.muted} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={C.light}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Password */}
              <Text style={s.label}>Password</Text>
              <View style={s.inputWrap}>
                <Ionicons name="lock-closed-outline" size={18} color={C.muted} style={s.inputIcon} />
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  value={pass}
                  onChangeText={setPass}
                  placeholder="••••••••"
                  placeholderTextColor={C.light}
                  secureTextEntry={!showPass}
                />
                <TouchableOpacity onPress={() => setShowPass(v => !v)} style={s.eye}>
                  <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.muted} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={s.forgot}>
                <Text style={s.forgotText}>Forgot password?</Text>
              </TouchableOpacity>

              {/* Sign In button */}
              <TouchableOpacity onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
                <LinearGradient
                  colors={['#4A0A0C', C.primary, '#B52525']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[s.btn, loading && s.btnOff]}
                >
                  {loading
                    ? <ActivityIndicator color={C.white} />
                    : <Text style={s.btnText}>Sign In</Text>}
                </LinearGradient>
              </TouchableOpacity>

              {/* Divider */}
              <View style={s.divider}>
                <View style={s.dividerLine} />
                <Text style={s.dividerText}>or continue with</Text>
                <View style={s.dividerLine} />
              </View>

              {/* Social buttons */}
              <View style={s.socialRow}>
                <TouchableOpacity style={s.socialBtn} activeOpacity={0.75}
                  onPress={() => Alert.alert('Coming Soon', 'Google sign-in will be available soon.')}>
                  <Image source={{ uri: 'https://www.gstatic.com/images/branding/googleg/2x/googleg_standard_color_128dp.png' }} style={s.socialLogo} />
                  <Text style={s.socialText}>Google</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.socialBtn} activeOpacity={0.75}
                  onPress={() => Alert.alert('Coming Soon', 'Microsoft sign-in will be available soon.')}>
                  <Image source={{ uri: 'https://img.icons8.com/color/96/microsoft.png' }} style={s.socialLogo} />
                  <Text style={s.socialText}>Microsoft</Text>
                </TouchableOpacity>
              </View>

              {/* Sign up link */}
              <View style={s.linkRow}>
                <Text style={s.linkText}>Don't have an account? </Text>
                <Link href="/(auth)/signup">
                  <Text style={s.linkBold}>Sign Up</Text>
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
  brand:    { alignItems: 'center', paddingTop: 48, paddingBottom: 32, paddingHorizontal: sp.lg },
  logo:     { width: 70, height: 70, borderRadius: 16, marginBottom: 12 },
  appName:  { fontSize: 34, fontFamily: F.extraBold, color: '#fff', letterSpacing: 0.5 },
  tagline:  { fontSize: 13, fontFamily: F.regular, color: 'rgba(255,255,255,0.70)', marginTop: 4 },

  // Card
  card:       {
    backgroundColor: '#fff',
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    flex: 1, minHeight: SH * 0.60,
    paddingHorizontal: 24, paddingTop: 32, paddingBottom: 40,
  },
  cardTitle:  { fontSize: 24, fontFamily: F.bold,    color: C.text },
  cardSub:    { fontSize: 13, fontFamily: F.regular, color: C.muted, marginTop: 2, marginBottom: 20 },

  // Labels & inputs
  label:      { fontSize: 13, fontFamily: F.semiBold, color: C.text, marginBottom: 6, marginTop: 14 },
  inputWrap:  {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F5F5F7', borderRadius: 12,
    borderWidth: 1, borderColor: '#EBEBEB',
    paddingHorizontal: 12,
  },
  inputIcon:  { marginRight: 8 },
  input:      { flex: 1, paddingVertical: 13, fontSize: 15, fontFamily: F.regular, color: C.text },
  eye:        { padding: 4 },
  forgot:     { alignSelf: 'flex-end', marginTop: 8 },
  forgotText: { fontSize: 12, fontFamily: F.semiBold, color: C.accent },

  // Sign In button
  btn:      { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 22 },
  btnOff:   { opacity: 0.7 },
  btnText:  { color: '#fff', fontSize: 16, fontFamily: F.bold },

  // Divider
  divider:     { flexDirection: 'row', alignItems: 'center', marginVertical: 22, gap: 10 },
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
  linkRow:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  linkText: { fontSize: 14, fontFamily: F.regular, color: C.muted },
  linkBold: { fontSize: 14, fontFamily: F.bold,    color: C.accent },
});
