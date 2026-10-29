import { distanceBoard, type StandingLike } from "./leaderboard.ts";
import { MILESTONE_MILES } from "./quotes.ts";
import { METERS_PER_MILE, metersToMiles } from "./units.ts";

/**
 * The small facts that make progress feel like progress: what's next, who's just ahead,
 * who moved since yesterday, and which days this week had a run in them.
 */

/** Midnight at the start of the local day. */
export function startOfDay(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Midnight on the Monday of the local week. */
export function startOfWeek(now: Date = new Date()): Date {
  const day = startOfDay(now);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
}

/** Monday to Sunday: whether each day of the current week has an activity in it. */
export function weekDays(activityTimes: (string | Date)[], now: Date = new Date()): boolean[] {
  const monday = startOfWeek(now).getTime();
  const ran = Array<boolean>(7).fill(false);
  for (const t of activityTimes) {
    const day = Math.floor((startOfDay(new Date(t)).getTime() - monday) / 86_400_000 + 0.5);
    if (day >= 0 && day < 7) ran[day] = true;
  }
  return ran;
}

/** Monday = 0 … Sunday = 6. */
export const weekdayIndex = (now: Date = new Date()): number => (now.getDay() + 6) % 7;

export interface NextMilestone {
  miles: number;
  toGoM: number;
}

/** The next milestone short of or at the goal, or null once they're all behind the runner. */
export function nextMilestone(countedM: number, goalM: number): NextMilestone | null {
  const goalMiles = Math.round(metersToMiles(goalM));
  const next = MILESTONE_MILES.find((m) => m <= goalMiles && m * METERS_PER_MILE > countedM + 0.5);
  return next == null ? null : { miles: next, toGoM: next * METERS_PER_MILE - countedM };
}

/**
 * About how many runs of this length cover a distance still to go (at least one). Rounds to
 * the nearest run, so 20.3 miles to go is about 2 runs of 10.1, not 3.
 */
export const runsToCover = (toGoM: number, runM: number): number | null =>
  runM > 0 ? Math.max(1, Math.round(toGoM / runM)) : null;

export interface Rival<S> {
  standing: S;
  gapM: number;
}

/** The unfinished runner directly ahead on distance, and how far ahead they are. */
export function rivalAhead<S extends StandingLike>(standings: S[], userId: string): Rival<S> | null {
  const me = standings.find((s) => s.user_id === userId);
  if (!me || me.finished_at) return null;
  const ahead = standings
    .filter((s) => s.user_id !== userId && !s.finished_at && s.counted_distance_m > me.counted_distance_m)
    .sort((a, b) => a.counted_distance_m - b.counted_distance_m)[0];
  return ahead ? { standing: ahead, gapM: ahead.counted_distance_m - me.counted_distance_m } : null;
}

/**
 * Places gained (positive) or lost (negative) on the distance board since the day began,
 * given how far each runner has gone today.
 */
export function placeChanges<S extends StandingLike>(standings: S[], todayM: Map<string, number>): Map<string, number> {
  const before = standings.map((s) => ({
    ...s,
    // Someone who finished today wasn't a finisher this morning.
    finished_at: s.finished_at && !todayM.get(s.user_id) ? s.finished_at : null,
    counted_distance_m: Math.max(0, s.counted_distance_m - (todayM.get(s.user_id) ?? 0)),
  }));
  const was = new Map(distanceBoard(before).map((r) => [r.standing.user_id, r.place]));
  return new Map(distanceBoard(standings).map((r) => [r.standing.user_id, (was.get(r.standing.user_id) ?? r.place) - r.place]));
}

/** Who a runner overtook with a run of `runM`: ahead before it, behind after. Nearest first. */
export function passedBy<S extends StandingLike>(standings: S[], userId: string, runM: number): S[] {
  const me = standings.find((s) => s.user_id === userId);
  if (!me || runM <= 0) return [];
  const before = me.counted_distance_m - runM;
  return standings
    .filter((s) => s.user_id !== userId && !s.finished_at && s.counted_distance_m > before && s.counted_distance_m < me.counted_distance_m)
    .sort((a, b) => b.counted_distance_m - a.counted_distance_m);
}
