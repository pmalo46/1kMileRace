import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import EmojiPicker from 'rn-emoji-keyboard';

import { Card } from '@/components/card';
import { FeedStory } from '@/components/feed-story';
import { Text } from '@/components/text';
import { useActiveRace } from '@/lib/active-race';
import { useAuth } from '@/lib/auth';
import { CHEER_EMOJIS, useFeed } from '@/lib/feed';
import type { FeedItem } from '@/lib/types';
import { Radius, Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export default function Feed() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const { race, loaded } = useActiveRace();
  const { items, refresh, toggleCheer } = useFeed(race?.id);
  const userId = session?.user.id;
  const [pickingFor, setPickingFor] = useState<FeedItem | null>(null);

  const cheer = (item: FeedItem, emoji: string) => {
    if (!userId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    toggleCheer(item, emoji, userId);
  };

  // Catches up on anything missed while the app was in the background.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: Space.md, gap: Space.xs }}>
        <Text variant="label">{race?.name ?? ' '}</Text>
        <Text variant="heading" size={28}>
          Feed
        </Text>
      </View>
      <FlatList
        data={items ?? []}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingHorizontal: Space.md, gap: Space.sm, paddingBottom: Space.xxl * 2 }}
        onRefresh={refresh}
        refreshing={false}
        renderItem={({ item }) => (
          <FeedCard
            item={item}
            userId={userId}
            onCheer={(emoji) => cheer(item, emoji)}
            onPickEmoji={() => setPickingFor(item)}
          />
        )}
        ListEmptyComponent={
          <Text variant="muted" style={{ textAlign: 'center', marginTop: Space.xl }}>
            {loaded && !race
              ? 'Join or start a race and its feed shows up here.'
              : items
                ? 'Quiet so far. Log a run and get it started.'
                : ' '}
          </Text>
        }
      />
      <EmojiPicker
        open={pickingFor !== null}
        onClose={() => setPickingFor(null)}
        onEmojiSelected={({ emoji }) => {
          // Picking one you've already given keeps it, rather than taking it back.
          const latest = items?.find((i) => i.id === pickingFor?.id);
          if (latest && !latest.cheers.some((c) => c.emoji === emoji && c.user_id === userId)) cheer(latest, emoji);
        }}
        enableSearchBar
        categoryPosition="top"
        theme={{
          backdrop: '#00000066',
          knob: colors.border,
          container: colors.surface,
          header: colors.textMuted,
          skinTonesContainer: colors.surfaceAlt,
          category: {
            icon: colors.textMuted,
            iconActive: colors.accent,
            container: colors.surfaceAlt,
            containerActive: colors.surface,
          },
          search: {
            background: colors.surfaceAlt,
            text: colors.text,
            placeholder: colors.textMuted,
            icon: colors.textMuted,
          },
        }}
      />
    </SafeAreaView>
  );
}

function FeedCard({
  item,
  userId,
  onCheer,
  onPickEmoji,
}: {
  item: FeedItem;
  userId: string | undefined;
  onCheer: (emoji: string) => void;
  onPickEmoji: () => void;
}) {
  const { colors } = useTheme();
  const commentCount = item.comments[0]?.count ?? 0;
  // The quick picks, then whatever else people have cheered with.
  const emojis = [...new Set([...CHEER_EMOJIS, ...item.cheers.map((c) => c.emoji)])];
  return (
    <Card style={item.type === 'finish' ? { borderColor: colors.accent, borderWidth: 2 } : undefined}>
      <FeedStory item={item} isMe={item.actor_id === userId} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm, alignItems: 'center' }}>
        {emojis.map((emoji) => {
          const count = item.cheers.filter((c) => c.emoji === emoji).length;
          const mine = item.cheers.some((c) => c.emoji === emoji && c.user_id === userId);
          return (
            <Pressable
              key={emoji}
              onPress={() => onCheer(emoji)}
              accessibilityRole="button"
              accessibilityLabel={`Cheer ${emoji}${count ? `, ${count}` : ''}`}
              accessibilityState={{ selected: mine }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: Space.xs,
                minHeight: 36,
                paddingHorizontal: 12,
                borderRadius: Radius.pill,
                borderWidth: 1.5,
                borderColor: mine ? colors.accent : 'transparent',
                backgroundColor: colors.surfaceAlt,
                transform: [{ scale: pressed ? 1.15 : 1 }],
              })}>
              <Text size={17}>{emoji}</Text>
              {count > 0 && (
                <Text size={14} style={{ fontWeight: '800', color: mine ? colors.accent : colors.textMuted }}>
                  {count}
                </Text>
              )}
            </Pressable>
          );
        })}
        <Pressable
          onPress={onPickEmoji}
          accessibilityRole="button"
          accessibilityLabel="Cheer with another emoji"
          style={{
            minHeight: 36,
            minWidth: 36,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: Radius.pill,
            backgroundColor: colors.surfaceAlt,
          }}>
          <Text size={18} style={{ fontWeight: '800', color: colors.textMuted }}>
            +
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/comments', params: { item: item.id } })}
          accessibilityRole="link"
          style={{ marginLeft: 'auto', minHeight: 36, justifyContent: 'center', paddingHorizontal: Space.xs }}>
          <Text variant="muted" size={14} style={{ fontWeight: '700' }}>
            {commentCount === 0 ? 'Comment' : `${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}`}
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}
