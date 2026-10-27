import { METERS_PER_MILE, formatMiles, type Recap } from '@1k/core';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { names } from '@/lib/last-look';
import type { Standing } from '@/lib/types';
import { Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const nameOf = (s: Standing) => s.profile?.display_name ?? 'Runner';

/** The crew's news first, then yours: what happened in the race since the last look. */
function recapLines(recap: Recap<Standing>, me: Standing | undefined): { emoji: string; text: string }[] {
  const lines: { emoji: string; text: string }[] = [];
  if (recap.finished.length > 0) {
    lines.push({ emoji: '🏁', text: `${names(recap.finished.map(nameOf))} finished` });
  }
  if (recap.milestones.length === 1) {
    const [{ standing, miles }] = recap.milestones;
    lines.push({ emoji: '🎉', text: `${nameOf(standing)} hit ${miles.toLocaleString()} ${miles === 1 ? 'mile' : 'miles'}` });
  } else if (recap.milestones.length > 1) {
    lines.push({ emoji: '🎉', text: `${names(recap.milestones.map((m) => nameOf(m.standing)))} hit milestones` });
  }
  if (recap.joined.length > 0) {
    lines.push({ emoji: '👋', text: `${names(recap.joined.map(nameOf))} joined` });
  }
  if (recap.movers.length > 1) {
    lines.push({ emoji: '👟', text: `${recap.movers.length} of you ran` });
  }
  if (recap.youPassed.length > 0) {
    lines.push({ emoji: '⬆️', text: `You passed ${names(recap.youPassed.map(nameOf))}` });
  }
  if (recap.passedYou.length === 1) {
    const [them] = recap.passedYou;
    const gapM = them.counted_distance_m - (me?.counted_distance_m ?? 0);
    lines.push({
      emoji: '💨',
      text:
        me && gapM >= METERS_PER_MILE / 10
          ? `${nameOf(them)} passed you · ${formatMiles(gapM)} mi ahead`
          : `${nameOf(them)} passed you`,
    });
  } else if (recap.passedYou.length > 1) {
    lines.push({ emoji: '💨', text: `${names(recap.passedYou.map(nameOf))} passed you` });
  }
  return lines;
}

const headline = (recap: Recap<Standing>) =>
  recap.crewM >= METERS_PER_MILE / 10 ? `+${formatMiles(recap.crewM)} miles together` : 'New faces';

export function SinceLastLook({ recap, me }: { recap: Recap<Standing>; me: Standing | undefined }) {
  const { colors } = useTheme();
  const lines = recapLines(recap, me);
  const cheerable = recap.finished.length + recap.milestones.length + recap.joined.length > 0;
  return (
    <Card style={{ borderColor: colors.accent, borderWidth: 2 }}>
      <Text variant="label">While you were out</Text>
      <Text variant="heading">{headline(recap)}</Text>
      {lines.length > 0 && (
        <View style={{ gap: Space.xs }}>
          {lines.map((l) => (
            <View key={l.text} style={{ flexDirection: 'row', gap: Space.sm }}>
              <Text accessible={false}>{l.emoji}</Text>
              <Text style={{ flex: 1 }}>{l.text}</Text>
            </View>
          ))}
        </View>
      )}
      {cheerable && (
        <Pressable onPress={() => router.push('/feed')} accessibilityRole="link" style={{ paddingTop: Space.xs }}>
          <Text style={{ color: colors.accent, fontWeight: '800' }}>Cheer them →</Text>
        </Pressable>
      )}
    </Card>
  );
}

/** A peek at the recap from Home, leading to the full one on the leaderboard. */
export function SinceLastLookTeaser({ recap, me }: { recap: Recap<Standing>; me: Standing | undefined }) {
  const first = recapLines(recap, me)[0];
  return (
    <Pressable onPress={() => router.push('/leaderboard')} accessibilityRole="link">
      <Card>
        <Text variant="label">While you were out</Text>
        <Text variant="heading">{headline(recap)}</Text>
        {first && <Text variant="muted">{`${first.emoji} ${first.text}`}</Text>}
      </Card>
    </Pressable>
  );
}
