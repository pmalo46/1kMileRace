import { useCallback, useEffect, useState } from 'react';

import { supabase } from './supabase';
import type { Comment, FeedItem } from './types';

/** Quick picks shown on every card; the picker offers the rest. */
export const CHEER_EMOJIS = ['🔥', '👏', '💪', '🎉'] as const;

const FEED_ITEM =
  'id, type, actor_id, payload, created_at, actor:profiles!feed_items_actor_id_fkey(display_name, avatar_url), ' +
  'activity:activities(type, environment, distance_m, moving_time_s), cheers(user_id, emoji), comments(count)';

const COMMENT = 'id, feed_item_id, user_id, body, created_at, author:profiles(display_name)';

const topic = (name: string) => `${name}:${Math.random().toString(36).slice(2)}`;

/** The newest things that happened in a race, live: runs, milestones, finishes, and people joining. */
export function useFeed(raceId: string | undefined) {
  const [items, setItems] = useState<FeedItem[] | null>(null);

  const refresh = useCallback(async () => {
    if (!raceId) return;
    const { data } = await supabase
      .from('feed_items')
      .select(FEED_ITEM)
      .eq('race_id', raceId)
      .order('created_at', { ascending: false })
      .limit(50);
    setItems((data as unknown as FeedItem[] | null) ?? []);
  }, [raceId]);

  useEffect(() => {
    if (!raceId) return;
    refresh();
    // Cheers and comments have no race column to filter on; row-level security already
    // limits them to the signed-in user's races.
    const channel = supabase
      .channel(topic(`feed:${raceId}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feed_items', filter: `race_id=eq.${raceId}` },
        () => refresh(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cheers' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [raceId, refresh]);

  /** Adds the cheer, or takes it back if it's already there. Shows right away; the server catches up. */
  const toggleCheer = useCallback(
    async (item: FeedItem, emoji: string, userId: string) => {
      const mine = item.cheers.some((c) => c.user_id === userId && c.emoji === emoji);
      setItems(
        (list) =>
          list?.map((i) =>
            i.id !== item.id
              ? i
              : {
                  ...i,
                  cheers: mine
                    ? i.cheers.filter((c) => !(c.user_id === userId && c.emoji === emoji))
                    : [...i.cheers, { user_id: userId, emoji }],
                },
          ) ?? null,
      );
      const { error } = mine
        ? await supabase.from('cheers').delete().match({ feed_item_id: item.id, user_id: userId, emoji })
        : await supabase.from('cheers').insert({ feed_item_id: item.id, user_id: userId, emoji });
      if (error) refresh();
    },
    [refresh],
  );

  return { items, refresh, toggleCheer };
}

/** One feed item and its comments, oldest first. */
export function useComments(feedItemId: string | undefined) {
  const [item, setItem] = useState<FeedItem | null>(null);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!feedItemId) return;
    const { data, error } = await supabase
      .from('comments')
      .select(COMMENT)
      .eq('feed_item_id', feedItemId)
      .order('created_at');
    if (error) return setError(error.message);
    setError(null);
    setComments((data as unknown as Comment[] | null) ?? []);
  }, [feedItemId]);

  useEffect(() => {
    if (!feedItemId) return;
    supabase
      .from('feed_items')
      .select(FEED_ITEM)
      .eq('id', feedItemId)
      .maybeSingle()
      .then(({ data }) => setItem(data as unknown as FeedItem | null));
    refresh();
    const channel = supabase
      .channel(topic(`comments:${feedItemId}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments', filter: `feed_item_id=eq.${feedItemId}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [feedItemId, refresh]);

  const add = useCallback(
    async (body: string, userId: string) => {
      if (!feedItemId) throw new Error('This post is no longer available.');
      const { data, error } = await supabase
        .from('comments')
        .insert({ feed_item_id: feedItemId, user_id: userId, body })
        .select(COMMENT)
        .single();
      if (error) throw new Error(error.message);
      const posted = data as unknown as Comment;
      setComments((list) => [...(list ?? []).filter((c) => c.id !== posted.id), posted]);
    },
    [feedItemId],
  );

  const remove = useCallback(
    async (id: string) => {
      setComments((list) => list?.filter((c) => c.id !== id) ?? null);
      const { error } = await supabase.from('comments').delete().eq('id', id);
      if (error) refresh();
    },
    [refresh],
  );

  return { item, comments, error, add, remove };
}

/** "just now", "5m", "3h", "2d", then a date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
