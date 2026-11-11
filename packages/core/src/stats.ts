import { startOfDay, startOfWeek } from "./momentum.ts";
import { paceStatus, type RaceWindow } from "./progress.ts";
import type { GaitSplit } from "./track.ts";
import { METERS_PER_MILE, WALK_PACE_S_PER_MI, paceSecondsPerMile } from "./units.ts";

/**
 * The numbers behind a runner's My Race page: how their race has gone, week by week.
 * Everything is in the device's local time, like the rest of the app.
 */

export interface StatActivity {
  startedAt: Date | string;
  distanceM: number;
  movingTimeS: number;
  environment: "outdoor" | "treadmill";
  elevationGainM: number | null;
  /** Run vs walk measured during a GPS recording; without it the whole activity goes by its pace. */
  gait?: GaitSplit | null;
  /**
   * False for miles typed in without a time. Their moving time is a stand-in, so they count
   * toward distance but stay out of every time and pace figure, and they go by `type` for
   * running vs walking instead of by pace.
   */
  timed?: boolean;
  type?: "run" | "walk";
}

const isTimed = (a: StatActivity) => a.timed !== false;

export const MARATHON_M = 42_195;
/** Pace records only count activities at least this long, so a GPS blip can't set one. */
export const RECORD_MIN_M = METERS_PER_MILE;

export type Gait = "run" | "walk";

export const gaitOf = (a: Pick<StatActivity, "distanceM" | "movingTimeS" | "timed" | "type">): Gait =>
  a.timed === false
    ? (a.type ?? "run")
    : paceSecondsPerMile(a.distanceM, a.movingTimeS) > WALK_PACE_S_PER_MI
      ? "walk"
      : "run";

/**
 * The running and walking in an activity. A recording's measured split is scaled to the
 * activity's saved totals; anything else is all one or the other by its average pace.
 */
export function gaitParts(a: StatActivity): GaitSplit {
  if (!isTimed(a)) {
    const none = { distanceM: 0, movingTimeS: 0 };
    const whole = { distanceM: a.distanceM, movingTimeS: 0 };
    return gaitOf(a) === "run" ? { run: whole, walk: none } : { run: none, walk: whole };
  }
  const g = a.gait;
  const splitM = g ? g.run.distanceM + g.walk.distanceM : 0;
  const splitS = g ? g.run.movingTimeS + g.walk.movingTimeS : 0;
  if (g && splitM > 0 && splitS > 0) {
    const runM = (a.distanceM * g.run.distanceM) / splitM;
    const runS = (a.movingTimeS * g.run.movingTimeS) / splitS;
    return {
      run: { distanceM: runM, movingTimeS: runS },
      walk: { distanceM: a.distanceM - runM, movingTimeS: a.movingTimeS - runS },
    };
  }
  const whole = { distanceM: a.distanceM, movingTimeS: a.movingTimeS };
  const none = { distanceM: 0, movingTimeS: 0 };
  return gaitOf(a) === "run" ? { run: whole, walk: none } : { run: none, walk: whole };
}

export interface StatWeek {
  /** 1 for the week the race starts in. */
  number: number;
  /** Monday at midnight. */
  start: Date;
  distanceM: number;
  movingTimeS: number;
  count: number;
  /** Run pace this week (walks left out); null with no runs. */
  runPaceS: number | null;
  runDistanceM: number;
  runMovingTimeS: number;
  /** Total distance by the end of this week (or now, for the current week). */
  cumulativeM: number;
  /** Where an even-pace runner would be at the same moment. */
  expectedM: number;
  /** Even pace's share of the goal for this week (less for a week only partly in the race). */
  targetM: number;
}

export interface StatRecord {
  startedAt: Date;
  distanceM: number;
  movingTimeS: number;
  paceS: number;
  elevationGainM: number | null;
}

export const DAY_PARTS = ["Morning", "Midday", "Afternoon", "Evening", "Night"] as const;
export type DayPart = (typeof DAY_PARTS)[number];

/** Morning 5–11, midday 11–2, afternoon 2–5, evening 5–9, night 9–5. */
export function dayPartOf(at: Date): DayPart {
  const h = at.getHours();
  if (h >= 5 && h < 11) return "Morning";
  if (h >= 11 && h < 14) return "Midday";
  if (h >= 14 && h < 17) return "Afternoon";
  if (h >= 17 && h < 21) return "Evening";
  return "Night";
}

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export interface Streak {
  current: number;
  longest: number;
}

export interface RaceStats {
  count: number;
  distanceM: number;
  movingTimeS: number;
  /** Average pace over timed runs and walks; null until there's one. */
  avgPaceS: number | null;
  activeDays: number;
  avgDistanceM: number;
  marathons: number;

  gait: {
    run: { count: number; distanceM: number; movingTimeS: number; paceS: number | null };
    walk: { count: number; distanceM: number; movingTimeS: number; paceS: number | null };
    /** Share of distance that was running, 0–1. */
    runShare: number;
    /** Activities whose split was measured as they went, not judged by average pace. */
    measured: number;
  };

  /**
   * How much faster (positive) or slower (negative) recent run pace is than early run pace,
   * in seconds per mile. Null until there are four weeks with runs to compare.
   */
  paceChangeS: number | null;

  weeks: StatWeek[];
  bestWeek: StatWeek | null;
  /** The week with the most time on their feet. */
  toughestWeek: StatWeek | null;

  longest: StatRecord | null;
  fastest: StatRecord | null;
  biggestClimb: StatRecord | null;

  dayStreak: Streak;
  /** Weeks in a row that hit their even-pace target. */
  weekStreak: Streak;
  /** A full week's even-pace target. */
  weeklyTargetM: number;

  dayParts: { part: DayPart; count: number }[];
  favoriteDayPart: DayPart | null;
  weekdays: { day: (typeof WEEKDAYS)[number]; count: number }[];
  favoriteWeekday: (typeof WEEKDAYS)[number] | null;

  treadmillM: number;
  outdoorM: number;

  /** Total climb from activities that recorded it; null when none did. */
  climbM: number | null;
  /** Distance ahead (positive) or behind even pace right now. */
  aheadByM: number;
}

/** A whole-number day index from local calendar fields, immune to daylight saving. */
const dayIndex = (d: Date): number => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);

function streakOf(active: boolean[], allowGapAtEnd: boolean): Streak {
  let longest = 0;
  let run = 0;
  for (const on of active) {
    run = on ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // Today (or this week) isn't over yet, so it doesn't break a streak that reached yesterday.
  let end = active.length - 1;
  if (allowGapAtEnd && end >= 0 && !active[end]) end -= 1;
  let current = 0;
  while (end >= 0 && active[end]) {
    current += 1;
    end -= 1;
  }
  return { current, longest };
}

const toRecord = (a: StatActivity & { at: Date }): StatRecord => ({
  startedAt: a.at,
  distanceM: a.distanceM,
  movingTimeS: a.movingTimeS,
  paceS: paceSecondsPerMile(a.distanceM, a.movingTimeS),
  elevationGainM: a.elevationGainM,
});

const pace = (distanceM: number, movingTimeS: number) => (distanceM > 0 ? paceSecondsPerMile(distanceM, movingTimeS) : null);

export function raceStats(activities: StatActivity[], race: RaceWindow, now: Date = new Date()): RaceStats {
  const all = activities
    .map((a) => ({ ...a, at: new Date(a.startedAt) }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const distanceM = all.reduce((s, a) => s + a.distanceM, 0);
  const timed = all.filter(isTimed);
  const movingTimeS = timed.reduce((s, a) => s + a.movingTimeS, 0);
  const avgPaceS = pace(
    timed.reduce((s, a) => s + a.distanceM, 0),
    movingTimeS,
  );

  // Run vs walk, by pace.
  const gait = {
    run: { count: 0, distanceM: 0, movingTimeS: 0, paceS: null as number | null },
    walk: { count: 0, distanceM: 0, movingTimeS: 0, paceS: null as number | null },
    runShare: 0,
    measured: 0,
  };
  // Pace only from timed miles; untimed ones still count toward each side's distance.
  const timedM = { run: 0, walk: 0 };
  for (const a of all) {
    gait[gaitOf(a)].count += 1;
    const parts = gaitParts(a);
    for (const k of ["run", "walk"] as const) {
      gait[k].distanceM += parts[k].distanceM;
      gait[k].movingTimeS += parts[k].movingTimeS;
      if (isTimed(a)) timedM[k] += parts[k].distanceM;
    }
    if (a.gait && a.gait.run.distanceM + a.gait.walk.distanceM > 0) gait.measured += 1;
  }
  gait.run.paceS = pace(timedM.run, gait.run.movingTimeS);
  gait.walk.paceS = pace(timedM.walk, gait.walk.movingTimeS);
  gait.runShare = distanceM > 0 ? gait.run.distanceM / distanceM : 0;

  // Weeks from the race's first Monday to this week (or the race's last).
  const until = new Date(Math.min(now.getTime(), race.endsAt.getTime() - 1));
  const weeks: StatWeek[] = [];
  const weekAt = new Map<number, StatWeek>();
  if (until.getTime() >= race.startsAt.getTime()) {
    const last = dayIndex(startOfWeek(until));
    for (let start = startOfWeek(race.startsAt); dayIndex(start) <= last; ) {
      const week: StatWeek = {
        number: weeks.length + 1,
        start: new Date(start),
        distanceM: 0,
        movingTimeS: 0,
        count: 0,
        runPaceS: null,
        runDistanceM: 0,
        runMovingTimeS: 0,
        cumulativeM: 0,
        expectedM: 0,
        targetM: 0,
      };
      weeks.push(week);
      weekAt.set(dayIndex(start), week);
      start = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    }
  }
  for (const a of all) {
    const week = weekAt.get(dayIndex(startOfWeek(a.at)));
    if (!week) continue;
    week.distanceM += a.distanceM;
    week.count += 1;
    if (!isTimed(a)) continue;
    week.movingTimeS += a.movingTimeS;
    const { run } = gaitParts(a);
    week.runDistanceM += run.distanceM;
    week.runMovingTimeS += run.movingTimeS;
  }
  let cumulative = 0;
  for (const week of weeks) {
    week.runPaceS = pace(week.runDistanceM, week.runMovingTimeS);
    cumulative += week.distanceM;
    week.cumulativeM = cumulative;
    const end = new Date(week.start.getFullYear(), week.start.getMonth(), week.start.getDate() + 7);
    week.expectedM = paceStatus(0, race, new Date(Math.min(end.getTime(), now.getTime()))).expectedM;
    week.targetM = paceStatus(0, race, end).expectedM - paceStatus(0, race, week.start).expectedM;
  }

  const active = weeks.filter((w) => w.count > 0);
  const bestWeek = active.reduce<StatWeek | null>((b, w) => (!b || w.distanceM > b.distanceM ? w : b), null);
  const toughestWeek = active.reduce<StatWeek | null>((b, w) => (!b || w.movingTimeS > b.movingTimeS ? w : b), null);

  // Early weeks against recent weeks, up to four of each, never overlapping.
  const paced = weeks.filter((w) => w.runDistanceM > 0);
  let paceChangeS: number | null = null;
  if (paced.length >= 4) {
    const n = Math.min(4, Math.floor(paced.length / 2));
    const pooled = (ws: StatWeek[]) =>
      paceSecondsPerMile(
        ws.reduce((s, w) => s + w.runDistanceM, 0),
        ws.reduce((s, w) => s + w.runMovingTimeS, 0),
      );
    paceChangeS = pooled(paced.slice(0, n)) - pooled(paced.slice(-n));
  }

  // Records.
  const longestA = all.reduce<(typeof all)[number] | null>((b, a) => (!b || a.distanceM > b.distanceM ? a : b), null);
  const fastestA = timed
    .filter((a) => a.distanceM >= RECORD_MIN_M)
    .reduce<(typeof all)[number] | null>(
      (b, a) =>
        !b || paceSecondsPerMile(a.distanceM, a.movingTimeS) < paceSecondsPerMile(b.distanceM, b.movingTimeS) ? a : b,
      null,
    );
  const climbA = all
    .filter((a) => (a.elevationGainM ?? 0) > 0)
    .reduce<(typeof all)[number] | null>((b, a) => (!b || a.elevationGainM! > b.elevationGainM! ? a : b), null);

  // Streaks: days from the first activity to today, weeks across the race.
  const days = new Set(all.map((a) => dayIndex(a.at)));
  let dayStreak: Streak = { current: 0, longest: 0 };
  if (all.length > 0) {
    const first = dayIndex(all[0]!.at);
    const today = dayIndex(startOfDay(until));
    const flags: boolean[] = [];
    for (let d = first; d <= today; d++) flags.push(days.has(d));
    dayStreak = streakOf(flags, now.getTime() < race.endsAt.getTime());
  }
  // Half a meter of slack so floating point can't miss a target that was met.
  const weekStreak = streakOf(
    weeks.map((w) => w.count > 0 && w.distanceM >= w.targetM - 0.5),
    now.getTime() < race.endsAt.getTime(),
  );
  const raceMs = race.endsAt.getTime() - race.startsAt.getTime();
  const weeklyTargetM = raceMs > 0 ? (race.goalM * 7 * 86_400_000) / raceMs : 0;

  // When they run.
  const partCounts = new Map<DayPart, number>(DAY_PARTS.map((p) => [p, 0]));
  const dayCounts = Array<number>(7).fill(0);
  for (const a of all) {
    const part = dayPartOf(a.at);
    partCounts.set(part, partCounts.get(part)! + 1);
    dayCounts[(a.at.getDay() + 6) % 7]! += 1;
  }
  const dayParts = DAY_PARTS.map((part) => ({ part, count: partCounts.get(part)! }));
  const weekdays = WEEKDAYS.map((day, i) => ({ day, count: dayCounts[i]! }));
  const favoriteDayPart = all.length ? dayParts.reduce((b, p) => (p.count > b.count ? p : b)).part : null;
  const favoriteWeekday = all.length ? weekdays.reduce((b, d) => (d.count > b.count ? d : b)).day : null;

  const treadmillM = all.filter((a) => a.environment === "treadmill").reduce((s, a) => s + a.distanceM, 0);
  const climbed = all.filter((a) => a.elevationGainM != null);

  return {
    count: all.length,
    distanceM,
    movingTimeS,
    avgPaceS,
    activeDays: days.size,
    avgDistanceM: all.length ? distanceM / all.length : 0,
    marathons: distanceM / MARATHON_M,
    gait,
    paceChangeS,
    weeks,
    bestWeek,
    toughestWeek,
    longest: longestA ? toRecord(longestA) : null,
    fastest: fastestA ? toRecord(fastestA) : null,
    biggestClimb: climbA ? toRecord(climbA) : null,
    dayStreak,
    weekStreak,
    weeklyTargetM,
    dayParts,
    favoriteDayPart,
    weekdays,
    favoriteWeekday,
    treadmillM,
    outdoorM: distanceM - treadmillM,
    climbM: climbed.length ? climbed.reduce((s, a) => s + a.elevationGainM!, 0) : null,
    aheadByM: paceStatus(distanceM, race, now).aheadByM,
  };
}
