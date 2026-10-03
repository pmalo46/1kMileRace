import { formatPace, metersToMiles, paceSecondsPerMile, SECONDS_PER_DAY } from "./units.ts";
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
    | "manual_entry";
  severity: IssueSeverity;
  message: string;
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

/**
 * Applies race rules to an activity. Runs on the client for instant feedback and
 * on the server, where the result is authoritative.
 */
export function evaluateActivity(
  a: ActivityInput,
  rules: RaceRules,
  now: Date = new Date(),
): Evaluation {
  const issues: Issue[] = [];
  const reject = (code: Issue["code"], message: string) =>
    issues.push({ code, severity: "reject", message });
  const flag = (code: Issue["code"], message: string) =>
    issues.push({ code, severity: "flag", message });

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

  if (a.distanceM < rules.minDistanceM) {
    reject(
      "too_short",
      `So close! Activities need at least ${metersToMiles(rules.minDistanceM).toFixed(1)} mile to count.`,
    );
  }
  if (!rules.allowedTypes.includes(a.type)) {
    reject("type_not_allowed", `${a.type} activities don't count in this race.`);
  }

  const isTreadmill = a.environment === "treadmill";
  if (isTreadmill && !rules.allowTreadmill) {
    reject("treadmill_not_allowed", "Treadmill miles don't count in this race.");
  }
  if (isTreadmill && rules.requireTreadmillPhoto && a.evidenceCount === 0) {
    reject("treadmill_photo_required", "Add a photo of the treadmill console showing distance and time.");
  }
  if (isTreadmill && a.evidenceTakenAt) {
    const t = a.evidenceTakenAt.getTime();
    if (t < a.startedAt.getTime() - PHOTO_WINDOW_MS || t > a.endedAt.getTime() + PHOTO_WINDOW_MS) {
      flag("photo_time_mismatch", "The photo wasn't taken around the time of this workout.");
    }
  }

  if (a.distanceM > 0 && a.movingTimeS > 0) {
    const pace = paceSecondsPerMile(a.distanceM, a.movingTimeS);
    if (pace < rules.fastestPaceSecPerMile) {
      flag("pace_too_fast", `A ${formatPace(pace)}/mi pace is faster than we expect on foot.`);
    } else if (pace > rules.slowestPaceSecPerMile) {
      flag("pace_too_slow", `A ${formatPace(pace)}/mi pace looks more like errands than a dedicated walk.`);
    }
  }
  if (a.elapsedTimeS > 0 && a.movingTimeS / a.elapsedTimeS < rules.minMovingRatio) {
    flag("too_much_stopping", "This outing had a lot of stopped time.");
  }
  if (a.source === "manual") {
    flag("manual_entry", "Entered by hand, so an organizer may take a look.");
  }

  if (issues.some((i) => i.severity === "reject")) {
    return { status: "rejected", verification: "rejected", issues };
  }
  const verification = baseVerification(a);
  if (issues.length > 0 || verification === "photo") {
    // Photo evidence always gets a human look; it still counts in the meantime.
    return { status: "flagged", verification: "pending", issues };
  }
  return { status: "accepted", verification, issues };
}

function baseVerification(a: ActivityInput): Verification {
  if (a.environment === "treadmill") return "photo";
  if (a.source === "manual") return "pending";
  if (a.source === "app_gps" || a.polyline) return "gps";
  return "device";
}
