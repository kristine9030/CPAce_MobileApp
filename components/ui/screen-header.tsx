import { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, sp, type } from '@/constants/cpace-theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Show a back arrow and handle its press. */
  onBack?: () => void;
  /** Optional element rendered on the right (e.g. an action button). */
  right?: ReactNode;
}

/** Clean, unfilled header used across all feature screens. */
export function ScreenHeader({ title, subtitle, onBack, right }: ScreenHeaderProps) {
  return (
    <View style={h.wrap}>
      <View style={h.row}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={h.back} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>
        )}
        <View style={h.titleWrap}>
          <Text style={type.headerTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={[type.headerSubtitle, { marginTop: 1 }]} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={h.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const h = StyleSheet.create({
  wrap:      { backgroundColor: C.bg, paddingHorizontal: sp.lg, paddingTop: sp.sm, paddingBottom: sp.sm },
  row:       { flexDirection: 'row', alignItems: 'center' },
  back:      { width: 34, marginLeft: -4, marginRight: sp.xs },
  titleWrap: { flex: 1, justifyContent: 'center' },
  right:     { marginLeft: sp.sm },
});
