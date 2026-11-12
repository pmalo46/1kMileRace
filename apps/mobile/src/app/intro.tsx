import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Art } from '@/components/art';
import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { savedASpot, useInvitePreview } from '@/lib/invites';
import { markIntroSeen, pendingInvite } from '@/lib/onboarding';
import { introSlides, type IntroSlide, type RuleLine } from '@/lib/race-rules-copy';
import { Radius, Space, Sunrise } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/**
 * The race explained in a few swipes, before anyone is asked for an email. Shown once on
 * first launch; sign-in's "How the race works" brings it back (`replay`).
 */
export default function Intro() {
  const { replay } = useLocalSearchParams<{ replay?: string }>();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const slides = useMemo(introSlides, []);
  const pages = slides.length + 1;
  const [page, setPage] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const preview = useInvitePreview(useMemo(pendingInvite, []));
  const last = page === pages - 1;

  const goTo = (i: number) => {
    scroller.current?.scrollTo({ x: i * width, animated: true });
    setPage(i);
  };

  const finish = (mode: 'sign-up' | 'sign-in') => {
    markIntroSeen();
    if (replay) return router.back();
    router.replace({ pathname: '/sign-in', params: { mode } });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.top}>
        {!last && (
          <Pressable onPress={() => goTo(pages - 1)} accessibilityRole="button" hitSlop={12}>
            <Text variant="muted" style={{ fontWeight: '700' }}>
              Skip
            </Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}>
        {slides.map((slide) => (
          <Slide key={slide.art} slide={slide} width={width} />
        ))}
        <View style={[styles.page, { width }]}>
          <Art name="intro-pin" />
          <Text variant="heading" size={30} style={styles.center}>
            Pin on your number.
          </Text>
          {preview && (
            <Text size={18} style={styles.center}>
              {savedASpot(preview)}
            </Text>
          )}
        </View>
      </ScrollView>

      <View style={styles.bottom}>
        <View style={styles.dots} accessibilityLabel={`Page ${page + 1} of ${pages}`}>
          {Array.from({ length: pages }, (_, i) => (
            <View
              key={i}
              style={[styles.dot, { backgroundColor: i === page ? colors.accent : colors.track, width: i === page ? 22 : 8 }]}
            />
          ))}
        </View>
        {last ? (
          replay ? (
            <Button title="Back" onPress={() => finish('sign-in')} />
          ) : (
            <View style={{ gap: Space.sm }}>
              <Button title="I'm in" onPress={() => finish('sign-up')} />
              <Button title="I already have an account" variant="secondary" onPress={() => finish('sign-in')} />
            </View>
          )
        ) : (
          <Button title="Next" onPress={() => goTo(page + 1)} />
        )}
      </View>
    </SafeAreaView>
  );
}

function Slide({ slide, width }: { slide: IntroSlide; width: number }) {
  return (
    <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <Art name={slide.art} size={slide.rules ? 150 : 260} />
      <Text variant="heading" size={30} style={styles.center}>
        {slide.heading}
      </Text>
      {slide.rules && <RulesCard rules={slide.rules} />}
      <View style={{ gap: Space.sm }}>
        {slide.body.map((para, i) => (
          <Text key={i} size={18} style={[styles.center, { lineHeight: 25 }]}>
            {para.map((run, j) => (
              <Text key={j} size={18} style={run.strong ? { fontWeight: '800' } : undefined}>
                {run.text}
              </Text>
            ))}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

/** The short rulebook, like the back of a bib: a stripe of the brand gradient, then the list. */
function RulesCard({ rules }: { rules: RuleLine[] }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.rules, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <LinearGradient colors={Sunrise} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 8 }} />
      <View style={{ padding: Space.md, gap: Space.sm }}>
        {rules.map((rule) => (
          <Text
            key={rule.text}
            variant={rule.muted ? 'muted' : 'body'}
            size={rule.muted ? 15 : 16}
            style={{ lineHeight: 22 }}>
            {rule.strong && <Text style={{ fontWeight: '800' }}>{rule.strong} </Text>}
            {rule.text}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rules: { alignSelf: 'stretch', borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden' },
  top: { height: 44, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: Space.lg },
  page: { flexGrow: 1, paddingHorizontal: Space.lg, alignItems: 'center', justifyContent: 'center', gap: Space.md },
  center: { textAlign: 'center' },
  bottom: { padding: Space.lg, gap: Space.md },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { height: 8, borderRadius: Radius.pill },
});
