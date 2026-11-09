import { useEffect, useState, type RefObject } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';

import { Radius, Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { Button } from './button';
import { Text } from './text';

export interface CoachStep {
  /** Key into `targets`. Without one, or when that target isn't on screen, the step is a centered card. */
  target?: string;
  text: string;
}

interface Hole {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PAD = 6;
/** Room the tooltip needs beside a target. */
const TIP_ROOM = 190;

/**
 * A short tour over the real screen: dims everything but one thing at a time and says what
 * it's for. Scrolls each target into view first when the screen scrolls.
 */
export function CoachMarks({
  steps,
  targets,
  scroller,
  scrollY,
  onDone,
}: {
  steps: CoachStep[];
  targets: Record<string, RefObject<View | null>>;
  scroller?: RefObject<ScrollView | null>;
  /** The scroller's current offset, kept up to date by its onScroll. */
  scrollY?: RefObject<number>;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [hole, setHole] = useState<Hole | null | undefined>(undefined);
  const step = steps[index];

  useEffect(() => {
    setHole(undefined);
    const node = step?.target ? targets[step.target]?.current : null;
    if (!node) return setHole(null);
    let cancelled = false;
    const measure = (scrolled: boolean) =>
      node.measureInWindow((x, y, w, h) => {
        if (cancelled) return;
        if (w === 0 && h === 0) return setHole(null);
        const visible = y >= insets.top + Space.md && y + h <= height - insets.bottom - TIP_ROOM;
        if (!visible && !scrolled && scroller?.current && scrollY) {
          // Put the target about a quarter of the way down, leaving room for the tip below it.
          scroller.current.scrollTo({ y: Math.max(0, scrollY.current + y - height * 0.25), animated: false });
          setTimeout(() => measure(true), 60);
          return;
        }
        setHole({ x: x - PAD, y: y - PAD, width: w + PAD * 2, height: h + PAD * 2 });
      });
    // Let layout settle before measuring.
    const t = setTimeout(() => measure(false), 30);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [step, targets, scroller, scrollY, height, insets.top, insets.bottom]);

  if (!step) return null;
  const last = index === steps.length - 1;
  const next = () => (last ? onDone() : setIndex(index + 1));

  const tipBelow = hole ? hole.y + hole.height + TIP_ROOM < height - insets.bottom : true;
  const tipStyle = hole
    ? tipBelow
      ? { top: hole.y + hole.height + Space.sm }
      : { bottom: height - hole.y + Space.sm }
    : { top: height * 0.35 };

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onDone}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <Mask id="coach-hole">
            <Rect x={0} y={0} width={width} height={height} fill="white" />
            {hole && <Rect x={hole.x} y={hole.y} width={hole.width} height={hole.height} rx={Radius.md} fill="black" />}
          </Mask>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="rgba(10, 6, 20, 0.72)" mask="url(#coach-hole)" />
      </Svg>
      {/* Taps anywhere move the tour on; the highlighted thing isn't live during the tour. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={next} accessibilityElementsHidden />
      {hole !== undefined && (
        <Animated.View
          key={index}
          entering={FadeIn.duration(180)}
          style={[styles.tip, tipStyle, { backgroundColor: colors.surface, borderColor: colors.border }]}
          accessibilityViewIsModal>
          <Text variant="label">
            {index + 1} of {steps.length}
          </Text>
          <Text size={17} style={{ lineHeight: 24, fontWeight: '600' }}>
            {step.text}
          </Text>
          <View style={styles.row}>
            {!last && (
              <Pressable onPress={onDone} accessibilityRole="button" hitSlop={10}>
                <Text variant="muted" style={{ fontWeight: '700' }}>
                  Skip
                </Text>
              </Pressable>
            )}
            <View style={{ minWidth: 120 }}>
              <Button title={last ? 'Got it' : 'Next'} onPress={next} />
            </View>
          </View>
        </Animated.View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  tip: {
    position: 'absolute',
    left: Space.md,
    right: Space.md,
    padding: Space.md,
    gap: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: Space.lg },
});
