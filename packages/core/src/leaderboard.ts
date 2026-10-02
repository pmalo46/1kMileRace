import { projectedGoalMovingTimeS } from "./progress";

export interface StandingLike {
  user_id: string;
  counted_distance_m: number;
  counted_moving_time_s: number;
  finished_at: string | null;
  finish_moving_time_s: number | null;
}

export interface DistanceRow<S> {
  standing: S;
  /** Shared place for ties among non-finishers. */
  place: number;
  finished: boolean;
}

/** Finishers first in finish order, then everyone else by miles. */
export function distanceBoard<S extends StandingLike>(standings: S[]): DistanceRow<S>[] {
  const finishers = standings
    .filter((s) => s.finished_at)
    .sort((a, b) => a.finished_at!.localeCompare(b.finished_at!));
  const others = standings
    .filter((s) => !s.finished_at)
    .sort((a, b) => b.counted_distance_m - a.counted_distance_m);
  return withPlaces([...finishers, ...others], (s) => (s.finished_at ? s.finished_at : -s.counted_distance_m)).map(
    ({ standing, place }) => ({ standing, place, finished: !!standing.finished_at }),
  );
}

export interface TimeRow<S> {
  standing: S;
  place: number | null;
  /** Official 1000-mile moving time for finishers; a projection for everyone else. */
  timeS: number | null;
  projected: boolean;
}

/**
 * Finishers ranked by moving time for the goal distance. Non-finishers follow, unranked,
 * ordered by projected time at their current average pace.
 */
export function timeBoard<S extends StandingLike>(standings: S[], goalM: number): TimeRow<S>[] {
  const finishers = standings
    .filter((s) => s.finished_at && s.finish_moving_time_s != null)
    .sort((a, b) => a.finish_moving_time_s! - b.finish_moving_time_s!);
  const ranked = withPlaces(finishers, (s) => s.finish_moving_time_s!).map(({ standing, place }) => ({
    standing,
    place: place as number | null,
    timeS: standing.finish_moving_time_s,
    projected: false,
  }));
  const others = standings
    .filter((s) => !s.finished_at)
    .map((s) => ({
      standing: s,
      place: null,
      timeS: projectedGoalMovingTimeS(s.counted_distance_m, s.counted_moving_time_s, goalM),
      projected: true,
    }))
    .sort((a, b) => (a.timeS ?? Infinity) - (b.timeS ?? Infinity));
  return [...ranked, ...others];
}

/** Standard competition ranking (1, 2, 2, 4) over an already-sorted list. */
function withPlaces<S>(sorted: S[], key: (s: S) => string | number): { standing: S; place: number }[] {
  let lastKey: string | number | undefined;
  let lastPlace = 0;
  return sorted.map((standing, i) => {
    const k = key(standing);
    const place = i > 0 && k === lastKey ? lastPlace : i + 1;
    lastKey = k;
    lastPlace = place;
    return { standing, place };
  });
}
