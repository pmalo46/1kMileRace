import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { useMyRaces } from './races';

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
