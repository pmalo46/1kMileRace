import { formatDuration, formatMiles, formatPace, paceSecondsPerMile } from '@1k/core';
import { View } from 'react-native';

import { timeAgo } from '@/lib/feed';
import type { FeedItem } from '@/lib/types';
import { Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { Text } from './text';

/** What happened, in words: "ran 3.2 miles", "hit 100 miles", "joined the race". */
function story(item: FeedItem): { headline: string; detail?: string } {
  if (item.type === 'activity' && item.activity) {
    const a = item.activity;
    const miles = formatMiles(a.distance_m);
    return {
      headline: `${a.type === 'walk' ? 'walked' : 'ran'} ${miles} ${miles === '1.0' ? 'mile' : 'miles'}`,
      detail: [
        formatDuration(a.moving_time_s),
        `${formatPace(paceSecondsPerMile(a.distance_m, a.moving_time_s))} /mi`,
        a.environment === 'treadmill' ? 'Treadmill' : null,
      ]
        .filter(Boolean)
        .join(' · '),
    };
  }
  if (item.type === 'finish') return { headline: 'crossed the finish line 🏁', detail: 'Every one of the miles. Done.' };
  if (item.type === 'milestone') {
    const miles = item.payload.miles ?? 0;
    return { headline: miles === 1 ? 'logged a first mile 🎉' : `hit ${miles.toLocaleString()} miles 🎉` };
  }
  if (item.type === 'joined') return { headline: 'joined the race 👋' };
  return { headline: 'logged some miles' };
}

/** Who did what and when: the top of a feed card, and the header of its comments. */
export function FeedStory({ item, isMe }: { item: FeedItem; isMe: boolean }) {
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
          {[detail, timeAgo(item.created_at)].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </View>
  );
}
