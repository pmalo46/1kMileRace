import { distanceBoard, type StandingLike } from "./leaderboard.ts";
import { MILESTONE_MILES } from "./quotes.ts";
import { METERS_PER_MILE, metersToMiles } from "./units.ts";

/**
 * What happened in the race between two looks at the standings: the crew's miles first,
 * then the milestones, finishes and new faces, then who swapped places with you.
 */

/** The parts of a standing a recap compares. Small enough to keep on the phone between looks. */
export interface RecapStanding extends StandingLike {
  total_distance_m: number;
  activity_count: number;
}

/** Ahead on the distance board: finishers first in finish order, then by miles. */
function aheadOf(a: StandingLike, b: StandingLike): boolean {
  if (a.finished_at && b.finished_at) return a.finished_at < b.finished_at;
  if (a.finished_at || b.finished_at) return !!a.finished_at;
  return a.counted_distance_m > b.counted_distance_m;
}

export interface Overtakes<S> {
  /** Ahead of you before, behind you now. Nearest first. */
  youPassed: S[];
  /** Behind you before, ahead of you now. Nearest first. */
  passedYou: S[];
}

/** Who swapped places with `userId` between two sets of standings. Runners new since `before` are left out. */
export function overtakes<S extends StandingLike>(before: StandingLike[], after: S[], userId: string): Overtakes<S> {
  const was = new Map(before.map((s) => [s.user_id, s]));
  const meBefore = was.get(userId);
  const meAfter = after.find((s) => s.user_id === userId);
  if (!meBefore || !meAfter) return { youPassed: [], passedYou: [] };
  const gap = (s: S) => Math.abs(s.counted_distance_m - meAfter.counted_distance_m);
  const youPassed: S[] = [];
  const passedYou: S[] = [];
  for (const s of after) {
    const then = was.get(s.user_id);
    if (!then || s.user_id === userId) continue;
    if (aheadOf(then, meBefore) && aheadOf(meAfter, s)) youPassed.push(s);
    if (aheadOf(meBefore, then) && aheadOf(s, meAfter)) passedYou.push(s);
  }
  return { youPassed: youPassed.sort((a, b) => gap(a) - gap(b)), passedYou: passedYou.sort((a, b) => gap(a) - gap(b)) };
}

/** Places gained (positive) or lost (negative) on the distance board between two sets of standings. */
export function placeChangesSince<S extends StandingLike>(before: StandingLike[], after: S[]): Map<string, number> {
  const was = new Map(distanceBoard(before).map((r) => [r.standing.user_id, r.place]));
  return new Map(
    distanceBoard(after).map((r) => [r.standing.user_id, (was.get(r.standing.user_id) ?? r.place) - r.place]),
  );
}

export interface Recap<S> {
  /** Miles everyone added between the two looks, bonus miles included. */
  crewM: number;
  /** Everyone who logged at least one run or walk, you included. */
  movers: S[];
  /** The highest milestone each runner crossed, short of the finish. */
  milestones: { standing: S; miles: number }[];
  finished: S[];
  joined: S[];
  youPassed: S[];
  passedYou: S[];
}

/** What changed in the race since `before`. Null when nothing did. */
export function sinceLastLook<S extends RecapStanding>(
  before: RecapStanding[],
  after: S[],
  userId: string,
  goalM: number,
): Recap<S> | null {
  const was = new Map(before.map((s) => [s.user_id, s]));
  const goalMiles = Math.round(metersToMiles(goalM));
  const marks = MILESTONE_MILES.filter((m) => m < goalMiles);

  let crewM = 0;
  const movers: S[] = [];
  const milestones: { standing: S; miles: number }[] = [];
  const finished: S[] = [];
  const joined: S[] = [];
  for (const s of after) {
    const then = was.get(s.user_id);
    if (!then) joined.push(s);
    crewM += Math.max(0, s.total_distance_m - (then?.total_distance_m ?? 0));
    if (s.activity_count > (then?.activity_count ?? 0)) movers.push(s);
    if (s.finished_at && !then?.finished_at) {
      finished.push(s);
      continue;
    }
    const fromM = then?.counted_distance_m ?? 0;
    const crossed = marks.filter((m) => fromM + 0.5 < m * METERS_PER_MILE && m * METERS_PER_MILE <= s.counted_distance_m + 0.5);
    if (crossed.length > 0) milestones.push({ standing: s, miles: crossed[crossed.length - 1]! });
  }

  const { youPassed, passedYou } = overtakes(before, after, userId);
  // A tenth of a mile is the least the recap can show as miles.
  if (crewM < METERS_PER_MILE / 10 && joined.length === 0 && finished.length === 0) return null;
  return {
    crewM,
    movers,
    milestones: milestones.sort((a, b) => b.miles - a.miles),
    finished,
    joined,
    youPassed,
    passedYou,
  };
}

/** Trims standings down to what a later recap needs, for keeping on the phone. */
export const recapSnapshot = (standings: RecapStanding[]): RecapStanding[] =>
  standings.map((s) => ({
    user_id: s.user_id,
    counted_distance_m: s.counted_distance_m,
    counted_moving_time_s: s.counted_moving_time_s,
    finished_at: s.finished_at,
    finish_moving_time_s: s.finish_moving_time_s,
    total_distance_m: s.total_distance_m,
    activity_count: s.activity_count,
  }));
