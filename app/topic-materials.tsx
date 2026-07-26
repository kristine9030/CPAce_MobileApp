import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Linking, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import client from '@/lib/api/client';
import { C, sp, r } from '@/constants/cpace-theme';
import { GradientButton } from '@/components/ui/gradient';

const F = {
  regular:   'Poppins_400Regular',
  medium:    'Poppins_500Medium',
  semiBold:  'Poppins_600SemiBold',
  bold:      'Poppins_700Bold',
  extraBold: 'Poppins_800ExtraBold',
} as const;

interface Material {
  id: number;
  title: string;
  description: string | null;
  kind: 'file' | 'link';
  file_category: string;
  original_name: string | null;
  file_size: number | null;
  human_size: string | null;
  uploader_name: string | null;
  url: string | null;
}

interface TopicInfo {
  id: number;
  name: string;
  description: string | null;
}

interface SubjectInfo {
  id: number;
  code: string;
  name: string;
  color: string;
}

// Same icon/colour pairs the web uses in Material::iconMeta().
const CATEGORY_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  pdf:        { icon: 'document-text',   color: '#e2483d' },
  word:       { icon: 'document',        color: '#2b579a' },
  excel:      { icon: 'grid',            color: '#217346' },
  powerpoint: { icon: 'easel',           color: '#d24726' },
  image:      { icon: 'image',           color: '#8e5bd0' },
  video:      { icon: 'videocam',        color: '#c0392b' },
  archive:    { icon: 'archive',         color: '#e8910b' },
  text:       { icon: 'reader',          color: '#607d8b' },
  link:       { icon: 'link',            color: '#3b7ddd' },
};

const metaFor = (category: string) => CATEGORY_META[category] ?? { icon: 'document-outline' as const, color: '#6b7280' };

export default function TopicMaterialsScreen() {
  const { subjectId, topicId, subjectCode, topicName } = useLocalSearchParams<{
    subjectId: string;
    topicId: string;
    subjectCode?: string;
    topicName?: string;
  }>();
  const router = useRouter();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [topic, setTopic] = useState<TopicInfo | null>(null);
  const [subject, setSubject] = useState<SubjectInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await client.get(`/subjects/${subjectId}/topics/${topicId}/materials`);
      setSubject(res.data.subject);
      setTopic(res.data.topic);
      setMaterials(res.data.materials);
    } catch {}
    setLoading(false);
  }, [subjectId, topicId]);

  useEffect(() => { load(); }, [load]);

  const open = async (material: Material) => {
    if (!material.url) {
      Alert.alert('Unavailable', 'This material has no file or link attached yet.');
      return;
    }
    const ok = await Linking.canOpenURL(material.url);
    if (!ok) {
      Alert.alert('Cannot open', 'No app on this device can open this material.');
      return;
    }
    Linking.openURL(material.url);
  };

  const accent = subject?.color || C.primary;
  const title = topic?.name || topicName || 'Topic';

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Topic hero ── */}
        <Animated.View entering={FadeInDown.delay(80).springify()}>
          <View style={[styles.hero, { borderLeftColor: accent }]}>
            <Text style={styles.heroTitle}>{title}</Text>
            {!!topic?.description && <Text style={styles.heroDesc}>{topic.description}</Text>}
            <View style={[styles.heroTag, { backgroundColor: accent + '1a' }]}>
              <Text style={[styles.heroTagText, { color: accent }]}>
                {(subject?.code || subjectCode || '')}{subject?.name ? ` · ${subject.name}` : ''}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* ── Materials ── */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Ionicons name="folder-open" size={16} color={C.primary} />
            <Text style={styles.sectionTitle}>Study Materials</Text>
            <Text style={styles.sectionCount}>({materials.length})</Text>
          </View>

          {materials.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="folder-open-outline" size={40} color="#E5D5D5" />
              <Text style={styles.emptyText}>
                No study materials have been added for this topic yet.
              </Text>
              <Text style={styles.emptySub}>
                Check back soon — your faculty will upload resources here.
              </Text>
            </View>
          ) : (
            materials.map((material, index) => {
              const meta = metaFor(material.file_category);
              return (
                <Animated.View key={material.id} entering={FadeInUp.delay(index * 70 + 150).springify()}>
                  <View style={styles.cardWrap}>
                    <View style={styles.card}>
                    <View style={styles.cardTop}>
                      <View style={[styles.cardIcon, { backgroundColor: meta.color }]}>
                        <Ionicons name={meta.icon} size={22} color="#fff" />
                      </View>
                      <View style={styles.cardBody}>
                        <Text style={styles.cardTitle} numberOfLines={2}>{material.title}</Text>
                        {!!material.description && (
                          <Text style={styles.cardDesc} numberOfLines={3}>{material.description}</Text>
                        )}
                        <View style={styles.cardMeta}>
                          {material.kind === 'file' ? (
                            <>
                              <Text style={styles.cardMetaText}>
                                {(material.file_category || 'file').toUpperCase()}
                              </Text>
                              {!!material.human_size && (
                                <Text style={styles.cardMetaText}>· {material.human_size}</Text>
                              )}
                            </>
                          ) : (
                            <Text style={styles.cardMetaText}>External link</Text>
                          )}
                          {!!material.uploader_name && (
                            <Text style={styles.cardMetaText}>· {material.uploader_name}</Text>
                          )}
                        </View>
                      </View>
                    </View>

                    <GradientButton
                      radius={12}
                      style={{ marginTop: 12 }}
                      contentStyle={styles.openBtn}
                      onPress={() => open(material)}
                    >
                      <Ionicons
                        name={material.kind === 'link' ? 'open-outline' : 'eye-outline'}
                        size={16}
                        color="#fff"
                      />
                      <Text style={styles.openBtnText}>
                        {material.kind === 'link' ? 'Open link' : 'View material'}
                      </Text>
                    </GradientButton>
                    </View>
                  </View>
                </Animated.View>
              );
            })
          )}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  scroll: { paddingBottom: 24 },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: sp.md,
    paddingVertical: sp.sm,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: F.bold,
    color: C.text,
    textAlign: 'center',
    marginHorizontal: 8,
  },

  /* Hero */
  hero: {
    marginHorizontal: sp.md,
    marginTop: sp.sm,
    backgroundColor: C.card,
    borderRadius: 16,
    borderLeftWidth: 5,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  heroTitle: {
    fontSize: 19,
    fontFamily: F.extraBold,
    color: C.text,
  },
  heroDesc: {
    fontSize: 12.5,
    fontFamily: F.regular,
    color: C.muted,
    marginTop: 5,
    lineHeight: 19,
  },
  heroTag: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: r.full,
  },
  heroTagText: {
    fontSize: 11,
    fontFamily: F.bold,
  },

  /* Section */
  section: {
    marginTop: 24,
    paddingHorizontal: sp.md,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: F.bold,
    color: C.text,
  },
  sectionCount: {
    fontSize: 12,
    fontFamily: F.medium,
    color: C.light,
  },

  /* Material card */
  cardWrap: {
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 16,
    padding: 14,
    overflow: 'hidden',
  },
  cardTop: {
    flexDirection: 'row',
    gap: 12,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14.5,
    fontFamily: F.semiBold,
    color: C.text,
  },
  cardDesc: {
    fontSize: 12,
    fontFamily: F.regular,
    color: C.muted,
    marginTop: 3,
    lineHeight: 18,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 7,
  },
  cardMetaText: {
    fontSize: 11,
    fontFamily: F.medium,
    color: C.light,
  },

  /* Open button */
  openBtn: {
    gap: 7,
    paddingVertical: 11,
  },
  openBtnText: {
    fontSize: 13.5,
    fontFamily: F.bold,
    color: '#fff',
  },

  /* Empty */
  empty: {
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 16,
    paddingVertical: 44,
    paddingHorizontal: 24,
    gap: 6,
  },
  emptyText: {
    fontSize: 13.5,
    fontFamily: F.medium,
    color: C.muted,
    textAlign: 'center',
    marginTop: 6,
  },
  emptySub: {
    fontSize: 12,
    fontFamily: F.regular,
    color: C.light,
    textAlign: 'center',
  },
});
