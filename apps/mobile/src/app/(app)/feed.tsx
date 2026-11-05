import { milestoneQuote } from '@1k/core';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Pressable, SectionList, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import EmojiPicker from 'rn-emoji-keyboard';

import { CommentComposer } from '@/components/comment-composer';
import { FeedStory } from '@/components/feed-story';
import { Quote } from '@/components/quote';
import { Text } from '@/components/text';
import { useActiveRace } from '@/lib/active-race';
import { useAuth } from '@/lib/auth';
import { CHEER, CHEER_EMOJIS, byDay, postComment, timeAgo, useFeed } from '@/lib/feed';
import type { FeedItem } from '@/lib/types';
import { Radius, Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** Lines up content under the story's text, past its 40pt avatar. */
const INDENT = 40 + Space.md;

const openComments = (item: FeedItem) => router.push({ pathname: '/comments', params: { item: item.id } });

/** How long the other emojis stay up after a cheer. */
const SWITCH_MS = 4000;

/** "6:42 AM": the day is already in the section header. */
const clockTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export default function Feed() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const { race, loaded } = useActiveRace();
  const { items, refresh, toggleCheer } = useFeed(race?.id);
  const userId = session?.user.id;
  const [pickingFor, setPickingFor] = useState<FeedItem | null>(null);
  // The one post whose quick cheers are showing, and the one being replied to.
  const [trayFor, setTrayFor] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<FeedItem | null>(null);
  const sections = useMemo(() => byDay(items ?? []), [items]);

  const cheer = (item: FeedItem, emoji: string) => {
    if (!userId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    toggleCheer(item, emoji, userId);
  };
  const gave = (item: FeedItem, emoji: string) => item.cheers.some((c) => c.emoji === emoji && c.user_id === userId);
  /** Trades the cheer just given for another emoji; one you've already given stays. */
  const switchCheer = (item: FeedItem, emoji: string) => {
    if (!userId || gave(item, emoji)) return;
    if (gave(item, CHEER)) toggleCheer(item, CHEER, userId);
    cheer(item, emoji);
  };

  // The other emojis show for a moment after a cheer, then get out of the way.
  useEffect(() => {
    if (!trayFor) return;
    const timer = setTimeout(() => setTrayFor(null), SWITCH_MS);
    return () => clearTimeout(timer);
  }, [trayFor]);

  // Catches up on anything missed while the app was in the background.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
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
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: Space.md, paddingBottom: Space.xxl * 2 }}
          onRefresh={refresh}
          refreshing={false}
          renderSectionHeader={({ section }) => (
            <Text variant="label" style={{ paddingTop: Space.md, paddingBottom: Space.xs }}>
              {section.title}
            </Text>
          )}
          ItemSeparatorComponent={() => (
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: INDENT }} />
          )}
          renderItem={({ item, section }) => {
            const props = {
              item,
              userId,
              time: section.title === 'Today' ? timeAgo(item.created_at) : clockTime(item.created_at),
              trayOpen: trayFor === item.id,
              onCheer: (emoji: string) => {
                // A fresh cheer offers the other emojis; taking it back puts them away.
                if (emoji === CHEER) setTrayFor(gave(item, CHEER) ? null : item.id);
                cheer(item, emoji);
              },
              onQuickCheer: (emoji: string) => {
                setTrayFor(null);
                switchCheer(item, emoji);
              },
              onPickEmoji: () => {
                setTrayFor(null);
                setPickingFor(item);
              },
            };
            return item.type === 'joined' ? (
              <JoinedRow {...props} />
            ) : (
              <PostRow {...props} replying={replyTo?.id === item.id} onReply={() => setReplyTo(item)} />
            );
          }}
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
        {replyTo && userId && (
          <CommentComposer
            key={replyTo.id}
            autoFocus
            header={
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: Space.md,
                  paddingTop: Space.sm,
                }}>
                <Text variant="muted" size={14} style={{ flex: 1 }}>
                  Replying to{' '}
                  <Text size={14} style={{ fontWeight: '800' }}>
                    {replyTo.actor_id === userId ? 'your post' : (replyTo.actor?.display_name ?? 'Runner')}
                  </Text>
                </Text>
                <Pressable onPress={() => setReplyTo(null)} accessibilityRole="button" hitSlop={12}>
                  <Text variant="muted" size={14} style={{ fontWeight: '800' }}>
                    Cancel
                  </Text>
                </Pressable>
              </View>
            }
            onPost={async (body, gif) => {
              await postComment(replyTo.id, userId, body, gif);
              setReplyTo(null);
              refresh();
            }}
          />
        )}
      </KeyboardAvoidingView>
      <EmojiPicker
        open={pickingFor !== null}
        onClose={() => setPickingFor(null)}
        onEmojiSelected={({ emoji }) => {
          const latest = items?.find((i) => i.id === pickingFor?.id);
          if (latest) switchCheer(latest, emoji);
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

interface RowProps {
  item: FeedItem;
  userId: string | undefined;
  time: string;
  trayOpen: boolean;
  onCheer: (emoji: string) => void;
  onQuickCheer: (emoji: string) => void;
  onPickEmoji: () => void;
}

/** A run, milestone, or finish: the story, its newest comment, and one-tap cheering. */
function PostRow({ item, userId, time, replying, onReply, ...cheers }: RowProps & { replying: boolean; onReply: () => void }) {
  const { colors } = useTheme();
  const commentCount = item.comments[0]?.count ?? 0;
  const latest = item.latest[0];
  const celebrating = item.type === 'milestone' || item.type === 'finish';
  return (
    <View
      style={[
        { paddingVertical: Space.md, gap: Space.sm },
        celebrating && {
          backgroundColor: colors.surface,
          borderRadius: Radius.lg,
          paddingHorizontal: Space.md,
          marginVertical: Space.sm,
          borderWidth: item.type === 'finish' ? 2 : 1,
          borderColor: item.type === 'finish' ? colors.accent : colors.border,
        },
      ]}>
      <Pressable onPress={() => openComments(item)} accessibilityRole="link" accessibilityHint="Opens the comments">
        <FeedStory item={item} isMe={item.actor_id === userId} time={time} />
      </Pressable>
      <View style={{ marginLeft: INDENT, gap: Space.sm }}>
        {celebrating && item.payload.miles != null && <Quote quote={milestoneQuote(item.payload.miles)} size={16} />}
        {latest && (
          <Pressable onPress={() => openComments(item)} accessibilityRole="link" style={{ gap: 2 }}>
            <Text size={15} numberOfLines={2}>
              <Text size={15} style={{ fontWeight: '800' }}>
                {latest.user_id === userId ? 'You' : (latest.author?.display_name ?? 'Runner')}
              </Text>{' '}
              {latest.body || 'sent a GIF'}
            </Text>
            {commentCount > 1 && (
              <Text variant="muted" size={14} style={{ fontWeight: '700' }}>
                View all {commentCount} comments
              </Text>
            )}
          </Pressable>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm, alignItems: 'center' }}>
          <Cheers item={item} userId={userId} {...cheers} />
          <Pressable
            onPress={onReply}
            accessibilityRole="button"
            accessibilityState={{ selected: replying }}
            style={{ marginLeft: 'auto', minHeight: 36, justifyContent: 'center', paddingHorizontal: Space.xs }}>
            <Text size={14} style={{ fontWeight: '800', color: replying ? colors.accent : colors.textMuted }}>
              Reply
            </Text>
          </Pressable>
        </View>
        <QuickCheers {...cheers} />
      </View>
    </View>
  );
}

/** Someone joining: one line, still easy to cheer. */
function JoinedRow({ item, userId, time, ...cheers }: RowProps) {
  const commentCount = item.comments[0]?.count ?? 0;
  const name = item.actor_id === userId ? 'You' : (item.actor?.display_name ?? 'Runner');
  return (
    <View style={{ paddingVertical: Space.sm, gap: Space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.sm }}>
        <Pressable onPress={() => openComments(item)} accessibilityRole="link" style={{ flex: 1, flexDirection: 'row', gap: Space.md }}>
          <Text size={20} style={{ width: 40, textAlign: 'center' }} accessible={false}>
            👋
          </Text>
          <Text variant="muted" style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800' }}>{name}</Text> joined the race · {time}
            {commentCount > 0 ? ` · ${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}` : ''}
          </Text>
        </Pressable>
        <Cheers item={item} userId={userId} {...cheers} />
      </View>
      <View style={{ marginLeft: INDENT }}>
        <QuickCheers {...cheers} />
      </View>
    </View>
  );
}

/** The cheer button, then the other cheers people gave. A tap gives one, or takes yours back. */
function Cheers({ item, userId, trayOpen, onCheer }: Pick<RowProps, 'item' | 'userId' | 'trayOpen' | 'onCheer'>) {
  const { colors } = useTheme();
  const count = (emoji: string) => item.cheers.filter((c) => c.emoji === emoji).length;
  const mine = (emoji: string) => item.cheers.some((c) => c.emoji === emoji && c.user_id === userId);
  const others = [...new Set(item.cheers.map((c) => c.emoji))].filter((e) => e !== CHEER);

  const chip = (emoji: string, label?: string) => {
    const n = count(emoji);
    const yours = mine(emoji);
    return (
      <Pressable
        key={emoji}
        onPress={() => onCheer(emoji)}
        accessibilityRole="button"
        accessibilityLabel={`${emoji}${n ? `, ${n}` : ''}${yours ? ', including yours' : ''}`}
        accessibilityHint={yours ? 'Takes your cheer back' : 'Cheers'}
        accessibilityState={{ selected: yours }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          minHeight: 36,
          paddingHorizontal: 12,
          borderRadius: Radius.pill,
          borderWidth: 1.5,
          borderColor: yours || (trayOpen && emoji === CHEER) ? colors.accent : 'transparent',
          backgroundColor: colors.surfaceAlt,
          transform: [{ scale: pressed ? 1.15 : 1 }],
        })}>
        <Text size={17}>{emoji}</Text>
        {(n > 0 || label) && (
          <Text size={14} style={{ fontWeight: '800', color: yours ? colors.accent : colors.textMuted }}>
            {n > 0 ? n : label}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <>
      {chip(CHEER, 'Cheer')}
      {others.map((emoji) => chip(emoji))}
    </>
  );
}

/** Right after a cheer: other emojis to switch it for, and + for any emoji. */
function QuickCheers({ trayOpen, onQuickCheer, onPickEmoji }: Pick<RowProps, 'trayOpen' | 'onQuickCheer' | 'onPickEmoji'>) {
  const { colors } = useTheme();
  if (!trayOpen) return null;
  const pill = {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
    backgroundColor: colors.surfaceAlt,
  } as const;
  return (
    <Animated.View entering={FadeIn.duration(150)} style={{ flexDirection: 'row', alignItems: 'center', gap: Space.sm }}>
      <Text variant="muted" size={14} style={{ fontWeight: '700' }}>
        Or
      </Text>
      {CHEER_EMOJIS.filter((e) => e !== CHEER).map((emoji) => (
        <Pressable
          key={emoji}
          onPress={() => onQuickCheer(emoji)}
          accessibilityRole="button"
          accessibilityLabel={`Switch to ${emoji}`}
          style={({ pressed }) => ({ ...pill, transform: [{ scale: pressed ? 1.15 : 1 }] })}>
          <Text size={20}>{emoji}</Text>
        </Pressable>
      ))}
      <Pressable onPress={onPickEmoji} accessibilityRole="button" accessibilityLabel="Cheer with another emoji" style={pill}>
        <Text size={18} style={{ fontWeight: '800', color: colors.textMuted }}>
          +
        </Text>
      </Pressable>
    </Animated.View>
  );
}
