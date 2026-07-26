import { useEffect } from 'react';
import { Dimensions, Image, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '@/constants/cpace-theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const LOGO_SRC = require('@/assets/images/logo-icon.png');
const WM_SRC = require('@/assets/images/wordmark-cropped.png');

const _logo = Image.resolveAssetSource(LOGO_SRC);
const LOGO_RATIO = _logo && _logo.height ? _logo.width / _logo.height : 429 / 457;
const _wm = Image.resolveAssetSource(WM_SRC);
const WM_RATIO = _wm && _wm.height ? _wm.width / _wm.height : 854 / 207;

const LOGO_W = Math.min(SCREEN_W * 0.34, 158);
const LOGO_H = LOGO_W / LOGO_RATIO;
const WM_W = Math.min(SCREEN_W * 0.46, 240);
const WM_H = WM_W / WM_RATIO;

// maroon fill needs to be big enough to cover the whole screen from the centre
const FILL_BASE = 80;
const FILL_SCALE = (Math.hypot(SCREEN_W, SCREEN_H) / FILL_BASE) * 1.2;

const MIN_DONE = 3200;

interface SplashScreenProps {
  onReady: () => void;
}

export function SplashScreen({ onReady }: SplashScreenProps) {
  const insets = useSafeAreaInsets();

  const logoP = useSharedValue(0);
  const wordP = useSharedValue(0);
  const tagP = useSharedValue(0);
  const loaderP = useSharedValue(0);
  const barP = useSharedValue(0);
  const fillP = useSharedValue(0);

  useEffect(() => {
    const OUT = Easing.out(Easing.cubic);

    logoP.value = withDelay(150, withTiming(1, { duration: 640, easing: OUT }));
    wordP.value = withDelay(640, withTiming(1, { duration: 520, easing: OUT }));
    tagP.value = withDelay(1040, withTiming(1, { duration: 460, easing: OUT }));

    // loading bar
    loaderP.value = withDelay(300, withTiming(1, { duration: 450, easing: OUT }));
    barP.value = withDelay(350, withTiming(1, { duration: 1650, easing: Easing.inOut(Easing.quad) }));

    // color-fill exit -> login
    fillP.value = withDelay(
      2050,
      withTiming(1, { duration: 720, easing: Easing.inOut(Easing.cubic) }, (fin) => {
        if (fin) runOnJS(onReady)();
      }),
    );

    const fallback = setTimeout(onReady, MIN_DONE);
    return () => clearTimeout(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoP.value,
    transform: [{ scale: interpolate(logoP.value, [0, 1], [0.9, 1]) }],
  }));

  const wordStyle = useAnimatedStyle(() => ({
    opacity: wordP.value,
    transform: [{ translateY: interpolate(wordP.value, [0, 1], [10, 0]) }],
  }));

  const tagStyle = useAnimatedStyle(() => ({
    opacity: tagP.value,
    transform: [{ translateY: interpolate(tagP.value, [0, 1], [6, 0]) }],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(fillP.value, [0, 0.5, 1], [1, 1, 0]),
  }));

  const loaderStyle = useAnimatedStyle(() => ({
    opacity: loaderP.value * interpolate(fillP.value, [0, 0.4, 1], [1, 1, 0]),
  }));

  const barFillStyle = useAnimatedStyle(() => ({ width: `${barP.value * 100}%` }));

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(fillP.value, [0, 1], [0, FILL_SCALE]) }],
  }));

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
      <Animated.View style={[styles.stack, contentStyle]}>
        <Animated.Image source={LOGO_SRC} style={[styles.logo, logoStyle]} resizeMode="contain" />
        <Animated.Image source={WM_SRC} style={[styles.wordmark, wordStyle]} resizeMode="contain" />
        <Animated.Text style={[styles.tagline, tagStyle]}>Your Edge to Ace CPALE</Animated.Text>
      </Animated.View>

      {/* loading bar */}
      <Animated.View style={[styles.loader, { bottom: insets.bottom + 40 }, loaderStyle]}>
        <View style={styles.track}>
          <Animated.View style={[styles.barFill, barFillStyle]} />
        </View>
        <Text style={styles.status}>Preparing for your review</Text>
      </Animated.View>

      {/* maroon color-fill that expands to cover the screen on exit */}
      <Animated.View style={[styles.fill, fillStyle]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stack: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: LOGO_W,
    height: LOGO_H,
  },
  wordmark: {
    width: WM_W,
    height: WM_H,
    marginTop: 14,
  },
  tagline: {
    marginTop: 8,
    fontSize: Math.max(WM_H * 0.3, 12),
    fontStyle: 'italic',
    color: '#5A5B60',
    letterSpacing: 1,
  },
  loader: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  track: {
    width: Math.min(SCREEN_W * 0.5, 220),
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(123, 20, 22, 0.10)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: C.accent,
  },
  status: {
    marginTop: 12,
    fontSize: 11,
    color: C.muted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  fill: {
    position: 'absolute',
    top: SCREEN_H / 2 - FILL_BASE / 2,
    left: SCREEN_W / 2 - FILL_BASE / 2,
    width: FILL_BASE,
    height: FILL_BASE,
    borderRadius: FILL_BASE / 2,
    backgroundColor: C.primary,
  },
});
