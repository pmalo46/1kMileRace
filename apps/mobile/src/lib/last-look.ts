import { recapSnapshot, sinceLastLook, type Recap, type RecapStanding } from '@1k/core';
import { useFocusEffect } from 'expo-router';
import Storage from 'expo-sqlite/kv-store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { Standing } from './types';

/**
 * The standings as they were the last time someone looked at the leaderboard, kept on the
 * phone, so the next look can say what happened in between.
 */
export interface LastLook {
  at: string;
  standings: RecapStanding[];
}

const key = (raceId: string, userId: string) => `last-look:${raceId}:${userId}`;

function read(raceId: string, userId: string): LastLook | null {
  try {
    const raw = Storage.getItemSync(key(raceId, userId));
    return raw ? (JSON.parse(raw) as LastLook) : null;
  } catch {
    return null;
  }
}

function save(raceId: string, userId: string, standings: Standing[]) {
  try {
    const look: LastLook = { at: new Date().toISOString(), standings: recapSnapshot(standings) };
    Storage.setItemSync(key(raceId, userId), JSON.stringify(look));
  } catch {
    // A missed save only means the next recap covers a little more.
  }
}

/**
 * What changed since the last look. With `record`, whatever the screen shows while it's
 * focused counts as seen; without it, the screen only peeks.
 */
export function useSinceLastLook(
  raceId: string | undefined,
  userId: string | undefined,
  standings: Standing[] | null,
  goalM: number,
  { record }: { record: boolean },
) {
  const [before, setBefore] = useState<LastLook | null>(null);
  const latest = useRef(standings);
  latest.current = standings;
  const focused = useRef(false);

  const remember = useCallback(() => {
    if (record && focused.current && raceId && userId && latest.current?.length) save(raceId, userId, latest.current);
  }, [record, raceId, userId]);

  useFocusEffect(
    useCallback(() => {
      if (!raceId || !userId) return;
      focused.current = true;
      setBefore(read(raceId, userId));
      remember();
      // Back from the background is a fresh look.
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          setBefore(read(raceId, userId));
          remember();
        }
      });
      return () => {
        focused.current = false;
        sub.remove();
      };
    }, [raceId, userId, remember]),
  );

  // Saved as soon as it's on screen, so another screen never shows news already seen here.
  useEffect(remember, [standings, remember]);

  const recap: Recap<Standing> | null = useMemo(
    () => (before && standings && userId ? sinceLastLook(before.standings, standings, userId, goalM) : null),
    [before, standings, userId, goalM],
  );
  return { before, recap };
}

/** "3 hours ago", "yesterday": how long since the last look. */
export function since(iso: string, now: Date = new Date()): string {
  const minutes = (now.getTime() - Date.parse(iso)) / 60_000;
  if (minutes < 60) return 'a little while ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** "Ann", "Ann and Bo", "Ann, Bo and 3 others". */
export function names(list: string[], shown = 2): string {
  if (list.length <= shown + 1) {
    return list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
  }
  const others = list.length - shown;
  return `${list.slice(0, shown).join(', ')} and ${others} others`;
}
