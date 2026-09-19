import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as NativeSplash from 'expo-splash-screen';
import { useFonts, Poppins_400Regular, Poppins_400Regular_Italic, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold, Poppins_900Black } from '@expo-google-fonts/poppins';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/context/auth-context';
import { AiTutorProvider } from '@/lib/context/ai-tutor-context';
import { MessagesProvider } from '@/lib/context/messages-context';
import { AiTutorWidget } from '@/components/ai-tutor/ai-tutor-widget';
import { SplashScreen } from '@/components/splash-screen';

NativeSplash.preventAutoHideAsync();

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router   = useRouter();
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_400Regular_Italic,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
    Poppins_900Black,
  });
  const [splashDone, setSplashDone] = useState(false);

  // Hide the splash once fonts settle. Also hide on error, otherwise a single
  // bad font name leaves the splash covering the app forever.
  useEffect(() => {
    if (fontsLoaded || fontError) {
      NativeSplash.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (loading) return;

    const inAuth = segments[0] === '(auth)';

    if (!user && !inAuth) {
      router.replace('/(auth)/login');
    } else if (user && inAuth) {
      router.replace('/(tabs)');
    }
  }, [user, loading, segments]);

  const showSplash = (!fontsLoaded && !fontError) || loading || !splashDone;

  if (showSplash) {
    return (
      <View style={{ flex: 1 }}>
        <SplashScreen onReady={() => setSplashDone(true)} />
      </View>
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="quiz"         options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="subject-detail" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="topic-materials" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="messages"      options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="class-quiz"    options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="community"     options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="note-quiz"     options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="search"        options={{ animation: 'slide_from_bottom' }} />
      </Stack>
      {user && <AiTutorWidget />}
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AiTutorProvider>
          <MessagesProvider>
            <RootLayoutNav />
            <StatusBar style="light" />
          </MessagesProvider>
        </AiTutorProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
