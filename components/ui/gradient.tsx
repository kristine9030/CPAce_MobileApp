import { ReactNode } from 'react';
import {
  ActivityIndicator, StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, grad, gradDir, r } from '@/constants/cpace-theme';

type Ramp = readonly [string, string, ...string[]];

/**
 * Primary button — same maroon ramp as the Sign In button on the login screen.
 * `style` positions the button (flex, margins); `contentStyle` shapes the
 * padded gradient surface itself.
 */
export function GradientButton({
  onPress,
  disabled,
  loading,
  colors = grad.brand,
  radius = r.md,
  style,
  contentStyle,
  children,
}: {
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  colors?: Ramp;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const off = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={off}
      activeOpacity={0.85}
      style={style}
    >
      <LinearGradient
        colors={colors}
        start={gradDir.horizontal.start}
        end={gradDir.horizontal.end}
        style={[g.btn, { borderRadius: radius }, contentStyle, off && g.off]}
      >
        {loading ? <ActivityIndicator color={C.white} /> : children}
      </LinearGradient>
    </TouchableOpacity>
  );
}

/**
 * Gradient outline. Draws a `width`-thick gradient ring around its children by
 * padding a gradient and clipping the inner surface to the inset radius.
 */
export function GradientBorder({
  radius = r.lg,
  width = 2,
  colors = grad.outline,
  style,
  innerStyle,
  children,
}: {
  radius?: number;
  width?: number;
  colors?: Ramp;
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  return (
    <LinearGradient
      colors={colors}
      start={gradDir.diagonal.start}
      end={gradDir.diagonal.end}
      style={[{ borderRadius: radius, padding: width }, style]}
    >
      <View style={[
        { borderRadius: Math.max(radius - width, 0), overflow: 'hidden' },
        innerStyle,
      ]}>
        {children}
      </View>
    </LinearGradient>
  );
}

/** Filled gradient surface — icon circles, badges, progress fills. */
export function GradientFill({
  colors = grad.brand,
  diagonal = true,
  style,
  children,
  pointerEvents,
}: {
  colors?: Ramp;
  diagonal?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only';
}) {
  const dir = diagonal ? gradDir.diagonal : gradDir.horizontal;
  return (
    <LinearGradient
      colors={colors}
      start={dir.start}
      end={dir.end}
      style={style}
      pointerEvents={pointerEvents}
    >
      {children}
    </LinearGradient>
  );
}

const g = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  off: { opacity: 0.6 },
});
