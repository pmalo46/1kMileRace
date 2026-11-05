import { raceStats, type PaceDetail, type RaceStats, type StatActivity } from '@1k/core';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { supabase } from './supabase';
import type { Race } from './types';

interface Row {
  activity: {
    started_at: string;
    distance_m: number;
    moving_time_s: number;
    environment: 'outdoor' | 'treadmill';
    elevation_gain_m: number | null;
    splits: PaceDetail | null;
  };
}

/**
 * One runner's stats for a race: every activity that counted in it (rejected ones never do).
 * Racemates can read each other's activities, so this works for anyone on the leaderboard.
 */
export function useRunnerStats(race: Race | null | undefined, userId: string | undefined) {
  const [stats, setStats] = useState<RaceStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const raceId = race?.id;
  const startsAt = race?.starts_at;
  const endsAt = race?.ends_at;
  const goalM = race?.goal_m;

  const refresh = useCallback(async () => {
    if (!raceId || !userId || !startsAt || !endsAt || !goalM) return;
    const { data, error } = await supabase
      .from('race_activities')
      .select('activity:activities!inner(started_at, distance_m, moving_time_s, environment, elevation_gain_m, splits)')
      .eq('race_id', raceId)
      .eq('user_id', userId);
    if (error) return setError(error.message);
    setError(null);
    const activities: StatActivity[] = ((data ?? []) as unknown as Row[]).map(({ activity: a }) => ({
      startedAt: a.started_at,
      distanceM: a.distance_m,
      movingTimeS: a.moving_time_s,
      environment: a.environment,
      elevationGainM: a.elevation_gain_m,
      gait: a.splits?.run && a.splits.walk ? { run: a.splits.run, walk: a.splits.walk } : null,
    }));
    setStats(
      raceStats(activities, {
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        goalM,
      }),
    );
  }, [raceId, userId, startsAt, endsAt, goalM]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { stats, error, refresh };
}
