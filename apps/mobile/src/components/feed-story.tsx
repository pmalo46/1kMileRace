import {
  formatDuration,
  formatMiles,
  formatPace,
  paceSecondsPerMile,
  trackingMethodOf,
  type TrackingMethod,
} from '@1k/core';
import { View } from 'react-native';

import { timeAgo } from '@/lib/feed';
import type { FeedItem } from '@/lib/types';
import { Radius, Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { Text } from './text';

const HOW_TRACKED: Record<TrackingMethod, string> = {
  app: 'GPS tracked',
  watch: 'Watch sync',
  treadmill: 'Logged manually',
  hand: 'Logged manually',
};

/** A small label on each run saying how it was tracked, so nobody has to dig for it. */
function tags(item: FeedItem): string[] {
  const a = item.activity;
  if (item.type !== 'activity' || !a?.source) return [];
  return [HOW_TRACKED[trackingMethodOf(a.source)]];
}

/** What happened, in words: "ran 3.2 miles", "hit 100 miles", "joined the race". */
function story(item: FeedItem): { headline: string; detail?: string } {
  if (item.type === 'activity' && item.activity) {
    const a = item.activity;
    const miles = formatMiles(a.distance_m);
    return {
      headline: `${a.type === 'walk' ? 'walked' : 'ran'} ${miles} ${miles === '1.0' ? 'mile' : 'miles'}`,
      detail: [
        ...(a.time_recorded === false
          ? ['Time not recorded']
          : [formatDuration(a.moving_time_s), `${formatPace(paceSecondsPerMile(a.distance_m, a.moving_time_s))} /mi`]),
        a.environment === 'treadmill' ? 'Treadmill' : null,
      ]
        .filter(Boolean)
        .join(' · '),
    };
  }
  if (item.type === 'finish') return { headline: 'finished 🏁' };
  if (item.type === 'milestone') {
    const miles = item.payload.miles ?? 0;
    return { headline: miles === 1 ? 'logged a first mile 🎉' : `hit ${miles.toLocaleString()} miles 🎉` };
  }
  if (item.type === 'joined') return { headline: 'joined the race 👋' };
  return { headline: 'logged some miles' };
}

/**
 * Who did what and when: the top of a feed card, and the header of its comments.
 * `time` replaces the "3h ago" style time, e.g. when the feed already shows the day.
 */
export function FeedStory({ item, isMe, time }: { item: FeedItem; isMe: boolean; time?: string }) {
  const { colors } = useTheme();
  const name = item.actor?.display_name ?? 'Runner';
  const { headline, detail } = story(item);
  return (
    <View style={{ flexDirection: 'row', gap: Space.md, alignItems: 'center' }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceAlt,
        }}>
        <Text variant="display" size={18}>
          {name.trim().charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text>
          <Text style={{ fontWeight: '800' }}>{isMe ? 'You' : name}</Text> {headline}
        </Text>
        <Text variant="muted" size={13}>
          {[detail, time ?? timeAgo(item.created_at)].filter(Boolean).join(' · ')}
        </Text>
        {tags(item).length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Space.xs, marginTop: 2 }}>
            {tags(item).map((t) => (
              <Text
                key={t}
                variant="label"
                size={11}
                style={{
                  color: colors.text,
                  backgroundColor: colors.surfaceAlt,
                  borderRadius: Radius.sm,
                  overflow: 'hidden',
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                }}>
                {t}
              </Text>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
