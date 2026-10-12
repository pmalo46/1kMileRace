import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { useAuth } from './auth';
import { useMyRaces, useStandings } from './races';

/** The race the app is focused on. For now, the most recently started one; a race switcher comes later. */
export function useActiveRace() {
  const { races, error, refresh } = useMyRaces();
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );
  return { race: races?.[0], loaded: races !== null, error, refresh };
}

/**
 * How far the signed-in runner still has to go in the active race; undefined until that's
 * known, or once they've finished. A run that covers it counts even under the minimum distance.
 */
export function useToFinishM(): number | undefined {
  const { session } = useAuth();
  const { race } = useActiveRace();
  const { standings } = useStandings(race?.id);
  const me = standings?.find((s) => s.user_id === session?.user.id);
  if (!race || !me || me.finished_at) return undefined;
  return race.goal_m - me.counted_distance_m;
}
