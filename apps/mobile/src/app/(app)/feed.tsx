import { milestoneQuote } from '@1k/core';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, SectionList, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import EmojiPicker from 'rn-emoji-keyboard';

import { Card } from '@/components/card';
import { FeedStory } from '@/components/feed-story';
import { Quote } from '@/components/quote';
import { Text } from '@/components/text';
import { useActiveRace } from '@/lib/active-race';
import { useAuth } from '@/lib/auth';
import { CHEER_EMOJIS, byDay, timeAgo, useFeed } from '@/lib/feed';
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
  // The one card whose quick cheers are showing.
  const [trayFor, setTrayFor] = useState<string | null>(null);
  const sections = useMemo(() => byDay(items ?? []), [items]);

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
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: Space.md, paddingBottom: Space.xxl * 2 }}
        onRefresh={refresh}
        refreshing={false}
        renderSectionHeader={({ section }) => (
          <Text variant="label" style={{ paddingTop: Space.lg, paddingBottom: Space.sm }}>
            {section.title}
          </Text>
        )}
        ItemSeparatorComponent={() => <View style={{ height: Space.sm }} />}
        renderItem={({ item, section }) => (
          <FeedCard
            item={item}
            userId={userId}
            today={section.title === 'Today'}
            trayOpen={trayFor === item.id}
            onToggleTray={() => setTrayFor((open) => (open === item.id ? null : item.id))}
            onCheer={(emoji) => cheer(item, emoji)}
            onQuickCheer={(emoji) => {
              setTrayFor(null);
              // A quick pick you've already given keeps it, rather than taking it back.
              if (!item.cheers.some((c) => c.emoji === emoji && c.user_id === userId)) cheer(item, emoji);
            }}
            onPickEmoji={() => {
              setTrayFor(null);
              setPickingFor(item);
            }}
          />
        )}
        ListEmptyComponent={
          <Text variant="muted" style={{ textAlign: 'center', marginTop: Space.xl }}>
            {loaded && !race
              ? 'Join a race to see its feed'
              : items
                ? 'No activity yet'
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

/** "6:42 AM": the day is already in the section header. */
const clockTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

function FeedCard({
  item,
  userId,
  today,
  trayOpen,
  onToggleTray,
  onCheer,
  onQuickCheer,
  onPickEmoji,
}: {
  item: FeedItem;
  userId: string | undefined;
  today: boolean;
  trayOpen: boolean;
  onToggleTray: () => void;
  onCheer: (emoji: string) => void;
  onQuickCheer: (emoji: string) => void;
  onPickEmoji: () => void;
}) {
  const { colors } = useTheme();
  const commentCount = item.comments[0]?.count ?? 0;
  // Only the cheers people have given, in the order they first appeared.
  const given = [...new Set(item.cheers.map((c) => c.emoji))];
  const pill = { minHeight: 36, paddingHorizontal: 12, borderRadius: Radius.pill, justifyContent: 'center' } as const;

  return (
    <Card style={item.type === 'finish' ? { borderColor: colors.accent, borderWidth: 2 } : undefined}>
      <FeedStory
        item={item}
        isMe={item.actor_id === userId}
        time={today ? timeAgo(item.created_at) : clockTime(item.created_at)}
      />
      {(item.type === 'milestone' || item.type === 'finish') && item.payload.miles != null && (
        <Quote quote={milestoneQuote(item.payload.miles)} size={16} />
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm, alignItems: 'center' }}>
        {given.map((emoji) => {
          const count = item.cheers.filter((c) => c.emoji === emoji).length;
          const mine = item.cheers.some((c) => c.emoji === emoji && c.user_id === userId);
          return (
            <Pressable
              key={emoji}
              onPress={() => onCheer(emoji)}
              accessibilityRole="button"
              accessibilityLabel={`${emoji}, ${count}${mine ? ', including yours' : ''}`}
              accessibilityHint={mine ? 'Takes your cheer back' : 'Adds your cheer'}
              accessibilityState={{ selected: mine }}
              style={({ pressed }) => ({
                ...pill,
                flexDirection: 'row',
                alignItems: 'center',
                gap: Space.xs,
                borderWidth: 1.5,
                borderColor: mine ? colors.accent : 'transparent',
                backgroundColor: colors.surfaceAlt,
                transform: [{ scale: pressed ? 1.15 : 1 }],
              })}>
              <Text size={17}>{emoji}</Text>
              <Text size={14} style={{ fontWeight: '800', color: mine ? colors.accent : colors.textMuted }}>
                {count}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={onToggleTray}
          accessibilityRole="button"
          accessibilityState={{ expanded: trayOpen }}
          style={{ ...pill, backgroundColor: trayOpen ? colors.accent : colors.surfaceAlt }}>
          <Text size={14} style={{ fontWeight: '800', color: trayOpen ? colors.onAccent : colors.textMuted }}>
            Cheer
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
      {trayOpen && (
        <Animated.View entering={FadeIn.duration(150)} style={{ flexDirection: 'row', gap: Space.sm }}>
          {CHEER_EMOJIS.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => onQuickCheer(emoji)}
              accessibilityRole="button"
              accessibilityLabel={`Cheer ${emoji}`}
              style={({ pressed }) => ({
                ...pill,
                flex: 1,
                alignItems: 'center',
                backgroundColor: colors.surfaceAlt,
                transform: [{ scale: pressed ? 1.15 : 1 }],
              })}>
              <Text size={20}>{emoji}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={onPickEmoji}
            accessibilityRole="button"
            accessibilityLabel="Cheer with another emoji"
            style={{ ...pill, flex: 1, alignItems: 'center', backgroundColor: colors.surfaceAlt }}>
            <Text size={18} style={{ fontWeight: '800', color: colors.textMuted }}>
              +
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </Card>
  );
}
