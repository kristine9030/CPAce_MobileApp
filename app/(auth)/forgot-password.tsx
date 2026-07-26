import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import client from '@/lib/api/client';
import { C } from '@/constants/cpace-theme';

const F = {
  regular:   'Poppins_400Regular',
  medium:    'Poppins_500Medium',
  semiBold:  'Poppins_600SemiBold',
  bold:      'Poppins_700Bold',
  extraBold: 'Poppins_800ExtraBold',
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const [step, setStep] = useState<'email' | 'verify'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  const sendCode = async () => {
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await client.post('/forgot-password', { email: value });
      setDevCode(data?.dev_code ?? null);
      setStep('verify');
    } catch (err: any) {
      Alert.alert('Something went wrong', err.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      Alert.alert('Invalid code', 'Enter the 6-digit code sent to your email.');
      return;
    }
    if (pass.length < 8) {
      Alert.alert('Weak password', 'Password must be at least 8 characters.');
      return;
    }
    if (pass !== confirm) {
      Alert.alert('Passwords do not match', 'Please re-enter your new password.');
      return;
    }
    setLoading(true);
    try {
      await client.post('/reset-password', {
        email: email.trim().toLowerCase(),
        code: code.trim(),
        password: pass,
        password_confirmation: confirm,
      });
      Alert.alert('Password reset', 'Your password has been changed. Please sign in.', [
        { text: 'OK', onPress: () => router.replace('/(auth)/login') },
      ]);
    } catch (err: any) {
      Alert.alert('Reset failed', err.message || 'Please try again.');
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
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={s.shapeA} />
          <View style={s.shapeB} />
          <View style={s.shapeC} />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            <TouchableOpacity
              style={s.back}
              onPress={() => (step === 'verify' ? setStep('email') : router.back())}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={18} color="#fff" />
              <Text style={s.backText}>{step === 'verify' ? 'Change email' : 'Back to Login'}</Text>
            </TouchableOpacity>

            <View style={s.card}>
              <View style={s.iconCircle}>
                <Ionicons name={step === 'email' ? 'lock-closed' : 'shield-checkmark'} size={26} color={C.primary} />
              </View>

              {step === 'email' ? (
                <>
                  <Text style={s.title}>Forgot your password?</Text>
                  <Text style={s.subtitle}>
                    Enter your email address and we&apos;ll send a 6-digit confirmation code to reset your password.
                  </Text>

                  <Text style={s.label}>Email address</Text>
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

                  <SubmitButton label="Send Reset Code" loading={loading} onPress={sendCode} />
                </>
              ) : (
                <>
                  <Text style={s.title}>Enter the code</Text>
                  <Text style={s.subtitle}>
                    We sent a 6-digit code to <Text style={s.emailBold}>{email.trim().toLowerCase()}</Text>. Enter it below
                    with your new password.
                  </Text>

                  {devCode && (
                    <View style={s.statusBox}>
                      <Ionicons name="information-circle" size={18} color={C.warning} style={{ marginTop: 1 }} />
                      <Text style={s.statusText}>
                        Dev mode (email not configured) — your code is <Text style={{ fontFamily: F.bold }}>{devCode}</Text>.
                      </Text>
                    </View>
                  )}

                  <Text style={s.label}>Confirmation code</Text>
                  <View style={s.inputWrap}>
                    <Ionicons name="keypad-outline" size={18} color={C.muted} style={s.inputIcon} />
                    <TextInput
                      style={[s.input, { letterSpacing: 6 }]}
                      value={code}
                      onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      placeholderTextColor={C.light}
                      keyboardType="number-pad"
                      maxLength={6}
                    />
                  </View>

                  <Text style={s.label}>New password</Text>
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
                    <TouchableOpacity onPress={() => setShowPass((v) => !v)} style={s.eye}>
                      <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.muted} />
                    </TouchableOpacity>
                  </View>

                  <Text style={s.label}>Confirm new password</Text>
                  <View style={s.inputWrap}>
                    <Ionicons name="lock-closed-outline" size={18} color={C.muted} style={s.inputIcon} />
                    <TextInput
                      style={[s.input, { flex: 1 }]}
                      value={confirm}
                      onChangeText={setConfirm}
                      placeholder="••••••••"
                      placeholderTextColor={C.light}
                      secureTextEntry={!showPass}
                    />
                  </View>

                  <SubmitButton label="Reset Password" loading={loading} onPress={resetPassword} />

                  <TouchableOpacity onPress={sendCode} disabled={loading} style={s.resend}>
                    <Text style={s.resendText}>Didn&apos;t get the code? Resend</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

function SubmitButton({ label, loading, onPress }: { label: string; loading: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={loading} activeOpacity={0.85}>
      <LinearGradient
        colors={['#4A0A0C', C.primary, '#B52525']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[s.btn, loading && s.btnOff]}
      >
        {loading ? <ActivityIndicator color={C.white} /> : <Text style={s.btnText}>{label}</Text>}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: '#4A0A0C' },
  gradient: { flex: 1 },
  scroll:   { flexGrow: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40 },

  shapeA: { position: 'absolute', top: -60, right: -70, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.055)' },
  shapeB: { position: 'absolute', top: 40, left: -55, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.045)' },
  shapeC: { position: 'absolute', top: 20, right: 46, width: 108, height: 108, borderRadius: 54, borderWidth: 2, borderColor: 'rgba(255,255,255,0.10)' },

  back:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 14, marginTop: 6 },
  backText: { color: '#fff', fontSize: 14, fontFamily: F.semiBold },

  card:     { backgroundColor: '#fff', borderRadius: 24, padding: 24, marginTop: 8 },

  iconCircle: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: '#F5E8E8',
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },

  title:    { fontSize: 22, fontFamily: F.bold, color: C.text },
  subtitle: { fontSize: 13, fontFamily: F.regular, color: C.muted, lineHeight: 20, marginTop: 6, marginBottom: 20 },
  emailBold:{ fontFamily: F.semiBold, color: C.text },

  statusBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#FFF7E6', borderWidth: 1, borderColor: '#F5E0B0', borderRadius: 12,
    padding: 12, marginBottom: 18,
  },
  statusText: { flex: 1, fontSize: 12.5, fontFamily: F.medium, color: '#8a6d1a', lineHeight: 18 },

  label:     { fontSize: 13, fontFamily: F.semiBold, color: C.text, marginBottom: 6, marginTop: 12 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F5F5F7', borderRadius: 12,
    borderWidth: 1, borderColor: '#EBEBEB', paddingHorizontal: 12,
  },
  inputIcon: { marginRight: 8 },
  input:     { flex: 1, paddingVertical: 13, fontSize: 15, fontFamily: F.regular, color: C.text },
  eye:       { padding: 4 },

  btn:     { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 22 },
  btnOff:  { opacity: 0.7 },
  btnText: { color: '#fff', fontSize: 16, fontFamily: F.bold },

  resend:     { alignItems: 'center', marginTop: 16 },
  resendText: { fontSize: 13, fontFamily: F.semiBold, color: C.accent },
});
