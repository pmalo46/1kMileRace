import { METERS_PER_MILE, formatMiles, type Recap } from '@1k/core';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { names, since } from '@/lib/last-look';
import type { Standing } from '@/lib/types';
import { Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const nameOf = (s: Standing) => s.profile?.display_name ?? 'Runner';

/** The crew's news first, then yours: what happened in the race since the last look. */
function recapLines(recap: Recap<Standing>, me: Standing | undefined): { emoji: string; text: string }[] {
  const lines: { emoji: string; text: string }[] = [];
  if (recap.finished.length > 0) {
    lines.push({ emoji: '🏁', text: `${names(recap.finished.map(nameOf))} finished. Every single mile.` });
  }
  if (recap.milestones.length === 1) {
    const [{ standing, miles }] = recap.milestones;
    lines.push({ emoji: '🎉', text: `${nameOf(standing)} hit ${miles.toLocaleString()} ${miles === 1 ? 'mile' : 'miles'}` });
  } else if (recap.milestones.length > 1) {
    lines.push({ emoji: '🎉', text: `${names(recap.milestones.map((m) => nameOf(m.standing)))} hit milestones` });
  }
  if (recap.joined.length > 0) {
    lines.push({ emoji: '👋', text: `${names(recap.joined.map(nameOf))} joined the race` });
  }
  if (recap.movers.length > 1) {
    lines.push({ emoji: '👟', text: `${recap.movers.length} of you got out there` });
  }
  if (recap.youPassed.length > 0) {
    lines.push({ emoji: '⬆️', text: `You moved past ${names(recap.youPassed.map(nameOf))}` });
  }
  if (recap.passedYou.length === 1) {
    const [them] = recap.passedYou;
    const gapM = them.counted_distance_m - (me?.counted_distance_m ?? 0);
    lines.push({
      emoji: '💨',
      text:
        me && gapM >= METERS_PER_MILE / 10
          ? `${nameOf(them)} moved past you, ${formatMiles(gapM)} mi ahead now`
          : `${nameOf(them)} moved past you`,
    });
  } else if (recap.passedYou.length > 1) {
    lines.push({ emoji: '💨', text: `${names(recap.passedYou.map(nameOf))} moved past you. Go run with them?` });
  }
  return lines;
}

const headline = (recap: Recap<Standing>) =>
  recap.crewM >= METERS_PER_MILE / 10 ? `The crew added ${formatMiles(recap.crewM)} miles` : 'New faces in the race';

export function SinceLastLook({ recap, at, me }: { recap: Recap<Standing>; at: string; me: Standing | undefined }) {
  const { colors } = useTheme();
  const lines = recapLines(recap, me);
  const cheerable = recap.finished.length + recap.milestones.length + recap.joined.length > 0;
  return (
    <Card style={{ borderColor: colors.accent, borderWidth: 2 }}>
      <Text variant="label">Since you last looked · {since(at)}</Text>
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
          <Text style={{ color: colors.accent, fontWeight: '800' }}>Send them some cheers →</Text>
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
        <Text variant="label">Since you last looked</Text>
        <Text variant="heading">{headline(recap)}</Text>
        <Text variant="muted">
          {first ? `${first.emoji} ${first.text}. ` : ''}See what changed on the leaderboard.
        </Text>
      </Card>
    </Pressable>
  );
}
