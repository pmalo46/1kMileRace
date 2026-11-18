import { polylineLengthM } from "./track.ts";
import { formatPace, METERS_PER_MILE, metersToMiles, paceSecondsPerMile, SECONDS_PER_DAY } from "./units.ts";
import type { ActivityInput, RaceRules, Verification } from "./types.ts";

export type IssueSeverity = "reject" | "flag";

export interface Issue {
  code:
    | "too_short"
    | "type_not_allowed"
    | "treadmill_not_allowed"
    | "treadmill_photo_required"
    | "photo_time_mismatch"
    | "bad_times"
    | "in_future"
    | "logged_too_late"
    | "pace_too_fast"
    | "pace_too_slow"
    | "too_much_stopping"
    | "manual_entry"
    | "mock_location"
    | "distance_mismatch";
  severity: IssueSeverity;
  message: string;
}

/** Runs typed in by hand at least this long wait for a reviewer; shorter ones count straight away. */
export const LONG_HAND_ENTRY_M = 6 * METERS_PER_MILE;

/**
 * The issues worth a person's time: ones that could put miles on the board that weren't run
 * or walked (a bike or car, a stretched route, a photo from another day). The rest (a slow
 * walk, a lot of stopping, a short run typed in by hand) stay on the run as notes and count
 * straight away; everyone can still see how each runner's miles were tracked.
 */
const REVIEW_CODES: ReadonlySet<Issue["code"]> = new Set(["pace_too_fast", "distance_mismatch", "photo_time_mismatch"]);

/** Whether a run should wait in the review queue. */
export function needsReview(a: Pick<ActivityInput, "source" | "distanceM">, issues: Issue[]): boolean {
  if (issues.some((i) => REVIEW_CODES.has(i.code))) return true;
  return a.source === "manual" && a.distanceM >= LONG_HAND_ENTRY_M;
}

export interface Evaluation {
  /** accepted: counts and is trusted. flagged: counts but awaits review. rejected: does not count. */
  status: "accepted" | "flagged" | "rejected";
  verification: Verification;
  issues: Issue[];
}

/** Clock skew tolerated between a device and the server. */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
/** How far a treadmill photo's EXIF time may sit from the workout. */
const PHOTO_WINDOW_MS = 3 * 60 * 60 * 1000;
/** Claimed distance may exceed the measured route by this much (polyline rounding, dropped fixes). */
const ROUTE_TOLERANCE = 1.05;
const ROUTE_TOLERANCE_M = 50;
/** Slack when comparing a run to the distance left, matching the standings calculation. */
const FINISH_TOLERANCE_M = 0.5;

/** What the rules need to know about the runner beyond the activity itself. */
/**
 * The moving time an untimed run gets: the race's slowest valid pace (30:00 a mile by
 * default; anything slower is already flagged as slower than a walk). The miles count in
 * full, and since no accepted run is slower, leaving the time out can't help anyone toward
 * Fastest 1,000.
 */
export function untimedMovingTimeS(distanceM: number, rules: RaceRules): number {
  return Math.max(1, Math.ceil(metersToMiles(distanceM) * rules.slowestPaceSecPerMile));
}

export const isUntimed = (a: Pick<ActivityInput, "timeRecorded">) => a.timeRecorded === false;

/**
 * An untimed run with its stand-in time filled in, ending when the runner said it did.
 * Only runs typed in by hand can be untimed; a recording or a watch always has its time.
 */
export function withUntimedTime(a: ActivityInput, rules: RaceRules): ActivityInput {
  if (!isUntimed(a) || !isHandEntered(a)) return a;
  const s = untimedMovingTimeS(a.distanceM, rules);
  return { ...a, movingTimeS: s, elapsedTimeS: s, startedAt: new Date(a.endedAt.getTime() - s * 1000) };
}

export interface RunnerContext {
  /**
   * The least distance the runner still needs to finish a race this activity falls in.
   * A run that covers it counts even when it's under the minimum distance.
   */
  toFinishM?: number;
}

/** Whether a distance is enough to count: the race minimum, or whatever finishes the runner's race. */
export function meetsMinimumDistance(distanceM: number, rules: RaceRules, runner: RunnerContext = {}): boolean {
  const toFinishM = runner.toFinishM ?? 0;
  const crossesTheLine = toFinishM > 0 && distanceM >= toFinishM - FINISH_TOLERANCE_M;
  return distanceM >= rules.minDistanceM || crossesTheLine;
}

/**
 * Applies race rules to an activity. Runs on the client for instant feedback and
 * on the server, where the result is authoritative.
 */
export function evaluateActivity(
  a: ActivityInput,
  rules: RaceRules,
  now: Date = new Date(),
  runner: RunnerContext = {},
): Evaluation {
  const issues: Issue[] = [];
  const reject = (code: Issue["code"], message: string) =>
    issues.push({ code, severity: "reject", message });
  const flag = (code: Issue["code"], message: string) =>
    issues.push({ code, severity: "flag", message });

  if (isUntimed(a) && !isHandEntered(a)) {
    reject("bad_times", "Only runs added by hand can be logged without a time.");
  }
  const durationS = (a.endedAt.getTime() - a.startedAt.getTime()) / 1000;
  if (durationS <= 0 || a.movingTimeS <= 0 || a.movingTimeS > a.elapsedTimeS + 1) {
    reject("bad_times", "The start, end, or moving time for this activity doesn't add up.");
  }
  if (a.endedAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    reject("in_future", "This activity ends in the future.");
  }
  if ((now.getTime() - a.endedAt.getTime()) / 1000 > rules.lateLogDays * SECONDS_PER_DAY) {
    reject(
      "logged_too_late",
      `Activities need to be logged within ${rules.lateLogDays} days of finishing.`,
    );
  }

  if (!meetsMinimumDistance(a.distanceM, rules, runner)) {
    reject(
      "too_short",
      `Activities need at least ${metersToMiles(rules.minDistanceM).toFixed(1)} mile to count.`,
    );
  }
  if (!rules.allowedTypes.includes(a.type)) {
    reject("type_not_allowed", `${a.type} activities don't count in this race.`);
  }

  const isTreadmill = a.environment === "treadmill";
  if (isTreadmill && !rules.allowTreadmill) {
    reject("treadmill_not_allowed", "Treadmill miles don't count in this race.");
  }
  // A watch's own record of a treadmill run stands in for the console photo.
  if (isTreadmill && isHandEntered(a) && rules.requireTreadmillPhoto && a.evidenceCount === 0) {
    reject("treadmill_photo_required", "Add a photo of the treadmill console.");
  }
  if (isTreadmill && a.evidenceTakenAt) {
    const t = a.evidenceTakenAt.getTime();
    if (t < a.startedAt.getTime() - PHOTO_WINDOW_MS || t > a.endedAt.getTime() + PHOTO_WINDOW_MS) {
      flag("photo_time_mismatch", "The photo wasn't taken around the time of this workout.");
    }
  }

  // An untimed run's pace is a stand-in, not something the runner did.
  if (a.distanceM > 0 && a.movingTimeS > 0 && !isUntimed(a)) {
    const pace = paceSecondsPerMile(a.distanceM, a.movingTimeS);
    if (pace < rules.fastestPaceSecPerMile) {
      flag("pace_too_fast", `A ${formatPace(pace)}/mi pace is faster than we expect on foot.`);
    } else if (pace > rules.slowestPaceSecPerMile) {
      flag("pace_too_slow", `A ${formatPace(pace)}/mi pace is slower than a walk.`);
    }
  }
  if (a.elapsedTimeS > 0 && a.movingTimeS / a.elapsedTimeS < rules.minMovingRatio) {
    flag("too_much_stopping", "This outing had a lot of stopped time.");
  }
  if (a.mockedLocation) {
    reject("mock_location", "Fake GPS detected.");
  }
  if (a.polyline) {
    const routeM = polylineLengthM(a.polyline);
    if (routeM == null || a.distanceM > routeM * ROUTE_TOLERANCE + ROUTE_TOLERANCE_M) {
      flag("distance_mismatch", "The distance is longer than the recorded route.");
    }
  }
  if (a.source === "manual") {
    flag("manual_entry", "Entered by hand.");
  }

  if (issues.some((i) => i.severity === "reject")) {
    return { status: "rejected", verification: "rejected", issues };
  }
  if (needsReview(a, issues)) {
    // It counts in the meantime.
    return { status: "flagged", verification: "pending", issues };
  }
  return { status: "accepted", verification: baseVerification(a), issues };
}

const isHandEntered = (a: ActivityInput) => a.source === "manual" || a.source === "treadmill_manual";

function baseVerification(a: ActivityInput): Verification {
  if (a.environment === "treadmill" && isHandEntered(a)) return "photo";
  // Typed in by hand: nothing measured it, but nothing about it needs a person either.
  if (a.source === "manual") return "device";
  if (a.source === "app_gps" || a.polyline) return "gps";
  return "device";
}
