import { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { comp, sh } from '@/constants/cpace-theme';

interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Adds the standard horizontal margins + bottom gap between stacked cards. */
  gap?: boolean;
  /** Use the dramatic 3D blur shadow effect. Defaults to true. */
  blur3d?: boolean;
}

/** Consistent white surface used for all content cards with frosted glass 3D effect. */
export function Card({ children, style, gap, blur3d = true }: CardProps) {
  if (blur3d) {
    return (
      <View style={[sh.blur3d, gap && comp.cardGap]}>
        <View style={[c.blurCard, style]}>
          {children}
        </View>
      </View>
    );
  }

  return <View style={[c.card, sh.sm, gap && comp.cardGap, style]}>{children}</View>;
}

const c = StyleSheet.create({
  card: comp.card,
  blurCard: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 16,
    padding: 16,
    overflow: 'hidden',
  },
});
