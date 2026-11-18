import type { Gif } from '@1k/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import { notify } from './feed';
import { supabase } from './supabase';

export interface Message {
  id: string;
  race_id: string;
  user_id: string;
  kind: 'chat' | 'announcement';
  /** Empty when the message is only a GIF. */
  body: string;
  gif_id: string | null;
  gif_url: string | null;
  gif_width: number | null;
  gif_height: number | null;
  created_at: string;
  author: { display_name: string } | null;
}

const MESSAGE =
  'id, race_id, user_id, kind, body, gif_id, gif_url, gif_width, gif_height, created_at, author:profiles(display_name)';
const PAGE = 50;

const topic = (name: string) => `${name}:${Math.random().toString(36).slice(2)}`;

/** A race's chat, newest first, live. `loadOlder` pages back 50 at a time. */
export function useMessages(raceId: string | undefined) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const loadingOlder = useRef(false);

  const refresh = useCallback(async () => {
    if (!raceId) return;
    const { data } = await supabase
      .from('messages')
      .select(MESSAGE)
      .eq('race_id', raceId)
      .order('created_at', { ascending: false })
      .limit(PAGE);
    const page = (data as unknown as Message[] | null) ?? [];
    // Keep anything older already paged in.
    setMessages((prev) => {
      const newest = new Set(page.map((m) => m.id));
      const oldest = page.at(-1)?.created_at;
      const older = (prev ?? []).filter((m) => !newest.has(m.id) && oldest && m.created_at < oldest);
      return [...page, ...older];
    });
    setHasOlder((prev) => prev || page.length === PAGE);
  }, [raceId]);

  const loadOlder = useCallback(async () => {
    const oldest = messages?.at(-1)?.created_at;
    if (!raceId || !oldest || loadingOlder.current || !hasOlder) return;
    loadingOlder.current = true;
    const { data } = await supabase
      .from('messages')
      .select(MESSAGE)
      .eq('race_id', raceId)
      .lt('created_at', oldest)
      .order('created_at', { ascending: false })
      .limit(PAGE);
    const page = (data as unknown as Message[] | null) ?? [];
    setMessages((prev) => [...(prev ?? []), ...page.filter((m) => !prev?.some((p) => p.id === m.id))]);
    setHasOlder(page.length === PAGE);
    loadingOlder.current = false;
  }, [raceId, messages, hasOlder]);

  useEffect(() => {
    if (!raceId) return;
    refresh();
    const channel = supabase
      .channel(topic(`messages:${raceId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `race_id=eq.${raceId}` }, () =>
        refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [raceId, refresh]);

  const send = useCallback(
    async (userId: string, body: string, gif: Gif | null) => {
      if (!raceId) throw new Error('Join a race to chat.');
      const { data, error } = await supabase
        .from('messages')
        .insert({
          race_id: raceId,
          user_id: userId,
          body,
          ...(gif ? { gif_id: gif.id, gif_url: gif.url, gif_width: gif.width, gif_height: gif.height } : {}),
        })
        .select(MESSAGE)
        .single();
      if (error) throw new Error(error.message);
      const sent = data as unknown as Message;
      setMessages((list) => [sent, ...(list ?? []).filter((m) => m.id !== sent.id)]);
      notify({ kind: 'message', messageId: sent.id });
    },
    [raceId],
  );

  const remove = useCallback(async (id: string) => {
    setMessages((list) => list?.filter((m) => m.id !== id) ?? null);
    const { error } = await supabase.from('messages').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }, []);

  return { messages, hasOlder, loadOlder, refresh, send, remove };
}

/** How long an announcement stays pinned. It's still in the chat after that. */
export const ANNOUNCEMENT_PIN_MS = 3 * 86_400_000;

const pinned = (m: Message | null) =>
  m && Date.now() - new Date(m.created_at).getTime() < ANNOUNCEMENT_PIN_MS ? m : null;

/** The race's newest announcement from the last 3 days, live, for pinning above the feed and the chat. */
export function useLatestAnnouncement(raceId: string | undefined) {
  const [announcement, setAnnouncement] = useState<Message | null>(null);
  const refresh = useCallback(async () => {
    if (!raceId) return;
    const { data } = await supabase
      .from('messages')
      .select(MESSAGE)
      .eq('race_id', raceId)
      .eq('kind', 'announcement')
      .gte('created_at', new Date(Date.now() - ANNOUNCEMENT_PIN_MS).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setAnnouncement((data as unknown as Message | null) ?? null);
  }, [raceId]);
  useEffect(() => {
    if (!raceId) return;
    refresh();
    const channel = supabase
      .channel(topic(`announcements:${raceId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `race_id=eq.${raceId}` }, () =>
        refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [raceId, refresh]);
  // Checked on every render too, so it unpins in an app that's been open since it was posted.
  return pinned(announcement);
}
