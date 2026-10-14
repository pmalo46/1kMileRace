import { startOfDay, startOfWeek, weekDays, weekdayIndex } from '@1k/core';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { supabase } from './supabase';

export interface MyWeek {
  /** Monday to Sunday: did a run start that day? */
  ran: boolean[];
  today: number;
  ranToday: boolean;
  distanceM: number;
  days: number;
}

/** The signed-in runner's current week, refreshed whenever the screen comes into view. */
export function useMyWeek(userId: string | undefined) {
  const [week, setWeek] = useState<MyWeek | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const now = new Date();
    const { data } = await supabase
      .from('activities')
      .select('started_at, distance_m')
      .eq('user_id', userId)
      .neq('verification', 'rejected')
      .gte('started_at', startOfWeek(now).toISOString());
    const runs = data ?? [];
    const ran = weekDays(
      runs.map((r) => r.started_at as string),
      now,
    );
    const today = weekdayIndex(now);
    setWeek({
      ran,
      today,
      ranToday: ran[today] ?? false,
      distanceM: runs.reduce((sum, r) => sum + (r.distance_m as number), 0),
      days: ran.filter(Boolean).length,
    });
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { week, refresh };
}

export interface RaceWeek {
  /** Counted distance per runner since Monday. */
  weekM: Map<string, number>;
  /** Counted distance per runner today. */
  todayM: Map<string, number>;
}

/** What everyone in a race has added this week and today, for the weekly board and "since this morning". */
export function useRaceWeek(raceId: string | undefined) {
  const [raceWeek, setRaceWeek] = useState<RaceWeek | null>(null);

  const refresh = useCallback(async () => {
    if (!raceId) return;
    const now = new Date();
    const { data } = await supabase
      .from('race_activities')
      .select('user_id, counted_distance_m, activity:activities!inner(ended_at)')
      .eq('race_id', raceId)
      .gte('activity.ended_at', startOfWeek(now).toISOString());
    const dayStart = startOfDay(now).getTime();
    const weekM = new Map<string, number>();
    const todayM = new Map<string, number>();
    for (const row of data ?? []) {
      const user = row.user_id as string;
      const m = row.counted_distance_m as number;
      const endedAt = (row.activity as unknown as { ended_at: string }).ended_at;
      weekM.set(user, (weekM.get(user) ?? 0) + m);
      if (Date.parse(endedAt) >= dayStart) todayM.set(user, (todayM.get(user) ?? 0) + m);
    }
    setRaceWeek({ weekM, todayM });
  }, [raceId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { raceWeek, refresh };
}
