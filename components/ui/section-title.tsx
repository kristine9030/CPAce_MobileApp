import { Text, StyleSheet, TextStyle, StyleProp } from 'react-native';
import { type, sp } from '@/constants/cpace-theme';

interface SectionTitleProps {
  children: string;
  style?: StyleProp<TextStyle>;
}

/** Consistent section heading used above card groups. */
export function SectionTitle({ children, style }: SectionTitleProps) {
  return <Text style={[st.title, style]}>{children}</Text>;
}

const st = StyleSheet.create({
  title: { ...type.sectionTitle, marginBottom: sp.sm, marginTop: sp.xs },
});
