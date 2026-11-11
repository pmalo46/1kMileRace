import { useCallback, useEffect, useState } from 'react';

import { useAuth } from './auth';
import { supabase } from './supabase';
import type { Race, Standing } from './types';

/**
 * Several screens and components ask for the same race list or standings as they mount or
 * regain focus, often within the same moment (Home alone asked for the race list five times).
 * Calls for the same thing within a short window share one request.
 */
const recent = new Map<string, { at: number; promise: Promise<unknown> }>();
const SHARE_MS = 1500;

function shared<T>(key: string, load: () => Promise<T>, force = false): Promise<T> {
  const hit = recent.get(key);
  if (!force && hit && Date.now() - hit.at < SHARE_MS) return hit.promise as Promise<T>;
  const promise = load();
  recent.set(key, { at: Date.now(), promise });
  promise.catch(() => recent.delete(key));
  return promise;
}

/** After joining or starting a race, the next look at the race list must be a fresh one. */
export const forgetSharedRequests = () => recent.clear();

/** Races the signed-in user belongs to, most recently started first. */
export function useMyRaces() {
  const { session } = useAuth();
  const [races, setRaces] = useState<Race[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session) return;
    const userId = session.user.id;
    const { data, error } = await shared(`races:${userId}`, async () =>
      supabase.from('race_members').select('race:races(*)').eq('user_id', userId).eq('status', 'active'),
    );
    if (error) return setError(error.message);
    const list = (data ?? [])
      .map((row) => row.race as unknown as Race | null)
      .filter((r): r is Race => r !== null)
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
    setRaces(list);
  }, [session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { races, error, refresh };
}

/** Live standings for a race. Re-fetches whenever any standing in the race changes. */
export function useStandings(raceId: string | undefined) {
  const [standings, setStandings] = useState<Standing[] | null>(null);

  /** `force` skips sharing: a realtime change means anything already in flight may predate it. */
  const refresh = useCallback(
    async (force = false) => {
      if (!raceId) return;
      const { data } = await shared(
        `standings:${raceId}`,
        async () =>
          supabase.from('race_standings').select('*, profile:profiles(display_name, avatar_url)').eq('race_id', raceId),
        force,
      );
      setStandings((data as Standing[] | null) ?? []);
    },
    [raceId],
  );

  useEffect(() => {
    if (!raceId) return;
    refresh();
    // supabase.channel() returns the existing channel for a topic, so screens that both
    // watch the same race (Home and Leaderboard) each need their own topic.
    const channel = supabase
      .channel(`standings:${raceId}:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'race_standings', filter: `race_id=eq.${raceId}` },
        () => refresh(true),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [raceId, refresh]);

  return { standings, refresh };
}
