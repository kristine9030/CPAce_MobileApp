import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import client from '@/lib/api/client';
import { C, sp, r, grad } from '@/constants/cpace-theme';
import { GradientButton, GradientFill } from '@/components/ui/gradient';

const F = {
  regular:   'Poppins_400Regular',
  medium:    'Poppins_500Medium',
  semiBold:  'Poppins_600SemiBold',
  bold:      'Poppins_700Bold',
  extraBold: 'Poppins_800ExtraBold',
} as const;

const SUBJECT_IMAGES: Record<string, any> = {
  'AUD':  require('@/assets/images/AUD.png'),
  'FAR':  require('@/assets/images/FAR.png'),
  'MS':   require('@/assets/images/MS.png'),
  'TAX':  require('@/assets/images/TAX.png'),
  'AFAR': require('@/assets/images/AFAR.png'),
  'RFBT': require('@/assets/images/RFBT.png'),
};

interface TopicNode {
  id: number;
  name: string;
  description: string;
  parent_id: number | null;
  question_count: number;
  material_count: number;
  mastery: number;
  is_weak?: boolean;
  children: TopicNode[];
}

interface SubjectInfo {
  id: number;
  code: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  topic_count?: number;
  question_count?: number;
}

export default function SubjectDetailScreen() {
  const { subjectId, subjectCode, subjectName } = useLocalSearchParams<{
    subjectId: string;
    subjectCode: string;
    subjectName: string;
  }>();
  const router = useRouter();
  const [topicTree, setTopicTree] = useState<TopicNode[]>([]);
  const [subject, setSubject] = useState<SubjectInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await client.get(`/subjects/${subjectId}/topics`);
      setSubject(res.data.subject);
      setTopicTree(res.data.topics ?? []);
    } catch (e: any) {
      setError(e?.message || 'Could not load topics.');
    }
    setLoading(false);
  }, [subjectId]);

  useEffect(() => { load(); }, [load]);

  const subjectImg = SUBJECT_IMAGES[subjectCode ?? ''];
  const displaySubject: Partial<SubjectInfo> =
    subject || { code: subjectCode, name: subjectName, color: C.primary };

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
        <Text style={styles.headerTitle} numberOfLines={1}>{displaySubject.name}</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >

        {/* ── Subject Hero ── */}
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <GradientFill colors={grad.brand} style={styles.hero}>
            <View style={styles.heroContent}>
              {subjectImg ? (
                <Image source={subjectImg} style={styles.heroImg} resizeMode="contain" />
              ) : (
                <View style={[styles.heroImgFallback, { backgroundColor: (displaySubject.color || C.primary) + '20' }]}>
                  <Ionicons name="library" size={36} color={displaySubject.color || C.primary} />
                </View>
              )}
              <View style={styles.heroInfo}>
                <Text style={styles.heroCode}>{displaySubject.code}</Text>
                <Text style={styles.heroName}>{displaySubject.name}</Text>
                <Text style={styles.heroDesc} numberOfLines={2}>{displaySubject.description || 'Master the fundamentals of this subject.'}</Text>
              </View>
            </View>
            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Ionicons name="book" size={14} color="rgba(255,255,255,0.7)" />
                <Text style={styles.heroStatText}>{subject?.topic_count ?? topicTree.length} Topics</Text>
              </View>
              <View style={styles.heroStatDot} />
              <View style={styles.heroStat}>
                <Ionicons name="help-circle" size={14} color="rgba(255,255,255,0.7)" />
                <Text style={styles.heroStatText}>{subject?.question_count ?? 0} Questions</Text>
              </View>
            </View>
          </GradientFill>
        </Animated.View>

        {/* ── Topic Tree ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose a topic to study</Text>
          {error ? (
            <View style={styles.empty}>
              <Ionicons name="cloud-offline-outline" size={40} color={C.danger} />
              <Text style={styles.emptyText}>{error}</Text>
              <GradientButton
                radius={r.full}
                style={{ marginTop: 6 }}
                contentStyle={styles.retryBtn}
                onPress={() => { setLoading(true); load(); }}
              >
                <Text style={styles.retryText}>Retry</Text>
              </GradientButton>
            </View>
          ) : topicTree.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="folder-open-outline" size={40} color="#D1D5DB" />
              <Text style={styles.emptyText}>No topics available yet.</Text>
            </View>
          ) : (
            topicTree.map((topic, index) => (
              <Animated.View key={topic.id} entering={FadeInUp.delay(index * 80 + 200).springify()}>
                <TopicNode
                  topic={topic}
                  depth={0}
                  index={index}
                  subjectId={subjectId!}
                  subjectCode={displaySubject.code ?? ''}
                />
              </Animated.View>
            ))
          )}
        </View>

        {/* ── Start Quiz Button ── */}
        <View style={styles.section}>
          <GradientButton
            radius={16}
            contentStyle={styles.startBtn}
            onPress={() => router.push({ pathname: '/(tabs)/quizzes', params: { subjectId: subjectId!, subjectCode: subjectCode! } })}
          >
            <Ionicons name="play" size={20} color="#fff" />
            <Text style={styles.startBtnText}>Start Quiz</Text>
          </GradientButton>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ── Recursive topic node ── */
function TopicNode({
  topic, depth, index, subjectId, subjectCode,
}: {
  topic: TopicNode;
  depth: number;
  index: number;
  subjectId: string;
  subjectCode: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(depth === 0);
  const hasChildren = topic.children && topic.children.length > 0;

  const navigateToMaterials = () => {
    router.push({
      pathname: '/topic-materials',
      params: {
        subjectId,
        topicId: String(topic.id),
        subjectCode,
        topicName: topic.name,
      },
    });
  };

  return (
    <View>
      <View style={[styles.topicCardWrap, { marginLeft: depth * 20 }]}>
        <View style={styles.topicCard}>
          <View style={styles.topicLeft}>
            {hasChildren ? (
              <TouchableOpacity
                onPress={() => setExpanded(v => !v)}
                activeOpacity={0.6}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <GradientFill style={styles.topicToggle}>
                  <Ionicons
                    name={expanded ? 'chevron-down' : 'chevron-forward'}
                    size={16}
                    color={C.white}
                  />
                </GradientFill>
              </TouchableOpacity>
            ) : (
              <View style={[styles.topicDot, { backgroundColor: C.primary + '30' }]}>
                <View style={[styles.topicDotInner, { backgroundColor: C.primary }]} />
              </View>
            )}
            <TouchableOpacity
              style={styles.topicInfo}
              activeOpacity={0.7}
              onPress={navigateToMaterials}
            >
              <Text style={styles.topicName} numberOfLines={1}>{topic.name}</Text>
              <View style={styles.topicMetaRow}>
                <Ionicons name="folder-open-outline" size={12} color={C.muted} />
                <Text style={styles.topicMeta}>
                  {topic.material_count ?? 0} material{topic.material_count === 1 ? '' : 's'}
                </Text>
                <Ionicons name="help-circle-outline" size={12} color={C.muted} style={{ marginLeft: 8 }} />
                <Text style={styles.topicMeta}>{topic.question_count} questions</Text>
                {hasChildren && (
                  <>
                    <Ionicons name="list-outline" size={12} color={C.muted} style={{ marginLeft: 8 }} />
                    <Text style={styles.topicMeta}>{topic.children.length} subtopics</Text>
                  </>
                )}
              </View>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.topicRight}
            activeOpacity={0.7}
            onPress={navigateToMaterials}
          >
            {topic.mastery > 0 ? (
              <View style={[styles.topicMasteryBadge, { backgroundColor: masteryColor(topic.mastery) + '18' }]}>
                <Text style={[styles.topicMasteryText, { color: masteryColor(topic.mastery) }]}>{topic.mastery}%</Text>
              </View>
            ) : (
              <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {hasChildren && expanded && (
        <View>
          {topic.children.map((child, ci) => (
            <TopicNode
              key={child.id}
              topic={child}
              depth={depth + 1}
              index={ci}
              subjectId={subjectId}
              subjectCode={subjectCode}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function masteryColor(pct: number) {
  if (pct >= 75) return '#2E7D32';
  if (pct >= 50) return C.primary;
  if (pct >= 25) return '#B8860B';
  return C.danger;
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
    borderRadius: 20,
    overflow: 'hidden',
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 12,
  },
  heroImg: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  heroImgFallback: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  heroInfo: {
    flex: 1,
    marginLeft: 14,
    gap: 2,
  },
  heroCode: {
    fontSize: 11,
    fontFamily: F.bold,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1,
  },
  heroName: {
    fontSize: 20,
    fontFamily: F.bold,
    color: '#fff',
  },
  heroDesc: {
    fontSize: 12,
    fontFamily: F.regular,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  heroStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroStatText: {
    fontSize: 12,
    fontFamily: F.semiBold,
    color: 'rgba(255,255,255,0.80)',
  },
  heroStatDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },

  /* Section */
  section: {
    marginTop: 24,
    paddingHorizontal: sp.md,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: F.bold,
    color: C.text,
    marginBottom: 14,
  },

  /* Topic card */
  topicCardWrap: {
    borderRadius: 14,
    marginBottom: 8,
    overflow: 'hidden',
  },
  topicCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 14,
    padding: 12,
    overflow: 'hidden',
  },
  topicLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  topicToggle: {
    width: 28,
    height: 28,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  topicDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topicDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  topicInfo: {
    flex: 1,
  },
  topicName: {
    fontSize: 14,
    fontFamily: F.semiBold,
    color: C.text,
  },
  topicMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
    flexWrap: 'wrap',
  },
  topicMeta: {
    fontSize: 11.5,
    fontFamily: F.regular,
    color: C.muted,
  },
  topicRight: {
    marginLeft: 8,
  },
  topicMasteryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: r.full,
  },
  topicMasteryText: {
    fontSize: 11,
    fontFamily: F.bold,
  },

  /* Empty */
  empty: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: F.regular,
    color: C.muted,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  retryText: {
    fontSize: 13,
    fontFamily: F.bold,
    color: '#fff',
  },

  /* Start button */
  startBtn: {
    paddingVertical: 16,
  },
  startBtnText: {
    fontSize: 16,
    fontFamily: F.bold,
    color: '#fff',
  },
});
