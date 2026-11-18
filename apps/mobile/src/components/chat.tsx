import { Image } from 'expo-image';
import { useMemo } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, View } from 'react-native';

import { useMembers } from '@/lib/admin';
import { useMessages, type Message } from '@/lib/chat';
import { timeAgo } from '@/lib/feed';
import { useTabBarGap } from '@/lib/tab-bar-gap';
import type { Race } from '@/lib/types';
import { Radius, Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { Announcement } from './announcement';
import { CommentComposer } from './comment-composer';
import { Text } from './text';

/**
 * The race's group chat: everyone in one conversation, newest at the bottom. Only an
 * @mention or an announcement sends a notification, so it never gets noisy.
 */
export function Chat({ race, userId }: { race: Race; userId: string }) {
  const { messages, hasOlder, loadOlder, send, remove } = useMessages(race.id);
  const { members } = useMembers(race.id);
  const names = useMemo(
    () =>
      (members ?? [])
        .filter((m) => m.user_id !== userId)
        .map((m) => m.profile?.display_name ?? '')
        .filter(Boolean),
    [members, userId],
  );
  const organizer = race.myRole === 'organizer';
  const gap = useTabBarGap();

  const confirmDelete = (m: Message) =>
    Alert.alert(
      m.user_id === userId ? 'Delete your message?' : `Delete ${m.author?.display_name ?? 'this'}'s message?`,
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            remove(m.id).catch((e) => Alert.alert('Couldn’t delete', e instanceof Error ? e.message : 'Try again.')),
        },
      ],
    );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        inverted
        data={messages ?? []}
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: Space.md, gap: Space.md }}
        onEndReached={loadOlder}
        onEndReachedThreshold={0.3}
        renderItem={({ item }) =>
          item.kind === 'announcement' ? (
            <Announcement message={item} />
          ) : (
            <MessageRow
              message={item}
              mine={item.user_id === userId}
              onLongPress={item.user_id === userId || organizer ? () => confirmDelete(item) : undefined}
            />
          )
        }
        ListFooterComponent={hasOlder ? <ActivityIndicator style={{ marginVertical: Space.md }} /> : null}
        ListEmptyComponent={
          messages ? (
            <Text
              variant="muted"
              style={{ textAlign: 'center', marginVertical: Space.xl, transform: [{ scaleY: -1 }] }}>
              Say hi. Plan a group run. Talk someone through mile 400. Type @ to mention someone.
            </Text>
          ) : (
            <ActivityIndicator style={{ marginVertical: Space.xl }} />
          )
        }
      />
      <View style={{ paddingBottom: gap }}>
        <CommentComposer
          placeholder="Message the race"
          maxLength={2000}
          mentionables={names}
          onPost={(body, gif) => send(userId, body, gif)}
        />
      </View>
    </View>
  );
}

function MessageRow({ message, mine, onLongPress }: { message: Message; mine: boolean; onLongPress?: () => void }) {
  const { colors } = useTheme();
  const name = message.author?.display_name ?? 'Runner';
  return (
    <Pressable
      onLongPress={onLongPress}
      accessibilityHint={onLongPress ? 'Long press to delete' : undefined}
      style={{ flexDirection: 'row', gap: Space.sm }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: mine ? colors.accent : colors.surfaceAlt,
        }}>
        <Text variant="display" size={15} style={mine ? { color: colors.onAccent } : undefined}>
          {name.trim().charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text size={14}>
          <Text size={14} style={{ fontWeight: '800' }}>
            {mine ? 'You' : name}
          </Text>
          <Text variant="muted" size={13}>
            {'  '}
            {timeAgo(message.created_at)}
          </Text>
        </Text>
        {!!message.body && <Text style={{ lineHeight: 22 }}>{message.body}</Text>}
        {message.gif_url && message.gif_width && message.gif_height && (
          <Image
            source={{ uri: message.gif_url }}
            accessibilityLabel="GIF"
            style={{ width: 180, aspectRatio: message.gif_width / message.gif_height, borderRadius: Radius.sm }}
          />
        )}
      </View>
    </Pressable>
  );
}
