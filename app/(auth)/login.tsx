import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Alert, Image, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
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
        {/* decorative abstract shapes */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={s.shapeA} />
          <View style={s.shapeB} />
          <View style={s.shapeC} />
          <View style={s.shapeD} />
          <View style={s.shapeE} />
        </View>

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

              <TouchableOpacity style={s.forgot} onPress={() => router.push('/(auth)/forgot-password')}>
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
                <Text style={s.dividerText}>or</Text>
                <View style={s.dividerLine} />
              </View>

              {/* Google sign-in */}
              <TouchableOpacity style={s.googleBtn} activeOpacity={0.8}
                onPress={() => Alert.alert('Coming Soon', 'Google sign-in will be available soon.')}>
                <Image source={{ uri: 'https://www.gstatic.com/images/branding/googleg/2x/googleg_standard_color_128dp.png' }} style={s.socialLogo} />
                <Text style={s.socialText}>Continue with Google</Text>
              </TouchableOpacity>
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

  // Abstract decorative shapes
  shapeA: { position: 'absolute', top: -60, right: -70, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.055)' },
  shapeB: { position: 'absolute', top: 30, left: -55, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.045)' },
  shapeC: { position: 'absolute', top: 18, right: 46, width: 108, height: 108, borderRadius: 54, borderWidth: 2, borderColor: 'rgba(255,255,255,0.10)' },
  shapeD: { position: 'absolute', top: 168, left: 34, width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.05)' },
  shapeE: { position: 'absolute', top: 118, right: -30, width: 90, height: 90, borderRadius: 45, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)' },

  // Brand
  brand:    { alignItems: 'center', paddingTop: 26, paddingBottom: 20, paddingHorizontal: sp.lg },
  logo:     { width: 108, height: 108, borderRadius: 24, marginBottom: 6 },
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

  // Google
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E5E5E5',
  },
  socialLogo: { width: 20, height: 20, resizeMode: 'contain' },
  socialText: { fontSize: 15, fontFamily: F.semiBold, color: C.text },

  // Link
  linkRow:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  linkText: { fontSize: 14, fontFamily: F.regular, color: C.muted },
  linkBold: { fontSize: 14, fontFamily: F.bold,    color: C.accent },
});
