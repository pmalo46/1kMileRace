import { useCallback, useEffect, useState } from 'react';

import { useAuth } from './auth';
import { supabase } from './supabase';
import type { Race, Standing } from './types';

/** Races the signed-in user belongs to, most recently started first. */
export function useMyRaces() {
  const { session } = useAuth();
  const [races, setRaces] = useState<Race[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase
      .from('race_members')
      .select('race:races(*)')
      .eq('user_id', session.user.id)
      .eq('status', 'active');
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

  const refresh = useCallback(async () => {
    if (!raceId) return;
    const { data } = await supabase
      .from('race_standings')
      .select('*, profile:profiles(display_name, avatar_url)')
      .eq('race_id', raceId);
    setStandings((data as Standing[] | null) ?? []);
  }, [raceId]);

  useEffect(() => {
    if (!raceId) return;
    refresh();
    const channel = supabase
      .channel(`standings:${raceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'race_standings', filter: `race_id=eq.${raceId}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [raceId, refresh]);

  return { standings, refresh };
}
