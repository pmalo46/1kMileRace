import { View } from 'react-native';

import type { Message } from '@/lib/chat';
import { timeAgo } from '@/lib/feed';
import { Radius, Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { Text } from './text';

/** An organizer's announcement, pinned above the feed and the chat. */
export function Announcement({ message }: { message: Message }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="summary"
      style={{
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: colors.accent,
        backgroundColor: colors.surface,
        padding: Space.md,
        gap: Space.xs,
      }}>
      <Text variant="label" style={{ color: colors.text }}>
        📣 Announcement · {message.author?.display_name ?? 'Organizer'} · {timeAgo(message.created_at)}
      </Text>
      <Text style={{ lineHeight: 22 }}>{message.body}</Text>
    </View>
  );
}
