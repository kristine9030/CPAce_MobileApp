import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C } from '@/constants/cpace-theme';

// Minimal markdown renderer for AI Tutor replies: headings, dividers,
// bullet lists, **bold**, `code`, *italic* — enough for exam-style answers.

function renderInline(text: string, baseColor: string, key: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).filter(Boolean);
  return (
    <Text key={key} style={{ color: baseColor, fontSize: 14, lineHeight: 20 }}>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <Text key={i} style={{ fontFamily: 'Poppins_700Bold' }}>{part.slice(2, -2)}</Text>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return <Text key={i} style={s.code}>{part.slice(1, -1)}</Text>;
        }
        if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
          return <Text key={i} style={{ fontStyle: 'italic' }}>{part.slice(1, -1)}</Text>;
        }
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
}

export function MarkdownLite({ text, color = C.text }: { text: string; color?: string }) {
  const lines = text.split('\n');
  return (
    <View>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <View key={i} style={{ height: 6 }} />;
        if (trimmed === '---') return <View key={i} style={s.divider} />;
        if (trimmed.startsWith('### ')) {
          return <Text key={i} style={[s.h3, { color }]}>{trimmed.slice(4)}</Text>;
        }
        if (trimmed.startsWith('## ')) {
          return <Text key={i} style={[s.h2, { color }]}>{trimmed.slice(3)}</Text>;
        }
        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
          return (
            <View key={i} style={s.bulletRow}>
              <Text style={[s.bulletDot, { color }]}>{'•'}</Text>
              <View style={{ flex: 1 }}>{renderInline(trimmed.slice(2), color, String(i))}</View>
            </View>
          );
        }
        return <View key={i}>{renderInline(trimmed, color, String(i))}</View>;
      })}
    </View>
  );
}

const s = StyleSheet.create({
  h2: { fontFamily: 'Poppins_700Bold', fontSize: 16, marginTop: 4, marginBottom: 2 },
  h3: { fontFamily: 'Poppins_600SemiBold', fontSize: 15, marginTop: 4, marginBottom: 2 },
  divider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 8 },
  bulletRow: { flexDirection: 'row', gap: 6, marginBottom: 2 },
  bulletDot: { fontSize: 14, lineHeight: 20 },
  code: {
    fontFamily: 'Poppins_500Medium',
    backgroundColor: '#f1f5f9',
    color: '#b91c1c',
    paddingHorizontal: 4,
    borderRadius: 4,
  },
});
