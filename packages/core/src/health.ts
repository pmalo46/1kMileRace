import type { ActivityType, Environment } from "./types.ts";

/**
 * Turning a workout recorded elsewhere (a watch, another fitness app) into an activity.
 * On Android these arrive through Health Connect, which Garmin, Fitbit, Samsung Health and
 * others write their workouts into.
 */

/** Health Connect's ExerciseSessionRecord.exerciseType values for the workouts that count. */
export const HEALTH_CONNECT_EXERCISE = {
  RUNNING: 56,
  RUNNING_TREADMILL: 57,
  WALKING: 79,
} as const;

/** A workout as read from the health store, with its distance already totalled. */
export interface HealthSession {
  /** The health store's id for the record; makes re-imports recognisable. */
  id: string;
  exerciseType: number;
  startTime: string;
  endTime: string;
  distanceM: number;
  /** Time spent exercising, not counting pauses, if the store reports it. */
  activeS?: number | null;
  deviceName?: string | null;
}

/** An activity ready to send to ingest-activity (dates as ISO strings). */
export interface ImportedActivity {
  source: "health_connect" | "healthkit";
  sourceExternalId: string;
  type: ActivityType;
  environment: Environment;
  startedAt: string;
  endedAt: string;
  distanceM: number;
  movingTimeS: number;
  elapsedTimeS: number;
  deviceName?: string;
  evidenceCount: 0;
}

const KINDS: Record<number, { type: ActivityType; environment: Environment }> = {
  [HEALTH_CONNECT_EXERCISE.RUNNING]: { type: "run", environment: "outdoor" },
  [HEALTH_CONNECT_EXERCISE.RUNNING_TREADMILL]: { type: "run", environment: "treadmill" },
  [HEALTH_CONNECT_EXERCISE.WALKING]: { type: "walk", environment: "outdoor" },
};

/** Null for anything that isn't a run or a walk (cycling, yoga, a swim), or has no usable times. */
export function activityFromHealthSession(s: HealthSession): ImportedActivity | null {
  const kind = KINDS[s.exerciseType];
  if (!kind) return null;
  const elapsedTimeS = Math.round((Date.parse(s.endTime) - Date.parse(s.startTime)) / 1000);
  if (!Number.isFinite(elapsedTimeS) || elapsedTimeS <= 0) return null;
  // Without a reported active time, the whole session counts as moving.
  const active = s.activeS != null && s.activeS > 0 ? Math.round(s.activeS) : elapsedTimeS;
  return {
    source: "health_connect",
    sourceExternalId: s.id,
    ...kind,
    startedAt: new Date(s.startTime).toISOString(),
    endedAt: new Date(s.endTime).toISOString(),
    distanceM: Math.max(0, s.distanceM),
    movingTimeS: Math.max(1, Math.min(active, elapsedTimeS)),
    elapsedTimeS,
    ...(s.deviceName ? { deviceName: s.deviceName.slice(0, 120) } : {}),
    evidenceCount: 0,
  };
}

/**
 * HealthKit's HKWorkoutActivityType values for the workouts that count. Hiking, cycling and
 * the rest don't: the race is for dedicated runs and walks.
 */
export const APPLE_WORKOUT = {
  RUNNING: 37,
  WALKING: 52,
} as const;

/** An Apple Health workout, read on the phone and flattened to plain values. */
export interface AppleWorkout {
  /** The workout's HealthKit UUID; makes re-imports recognisable. */
  id: string;
  activityType: number;
  startTime: string;
  endTime: string;
  distanceM: number;
  /** HealthKit's workout duration, which leaves out paused time. */
  durationS?: number | null;
  /** HKIndoorWorkout: a run on a treadmill. */
  indoor?: boolean;
  deviceName?: string | null;
}

/** Null for anything that isn't a run or a walk, or has no usable times. */
export function activityFromAppleWorkout(w: AppleWorkout): ImportedActivity | null {
  const type = w.activityType === APPLE_WORKOUT.RUNNING ? "run" : w.activityType === APPLE_WORKOUT.WALKING ? "walk" : null;
  if (!type) return null;
  const elapsedTimeS = Math.round((Date.parse(w.endTime) - Date.parse(w.startTime)) / 1000);
  if (!Number.isFinite(elapsedTimeS) || elapsedTimeS <= 0) return null;
  const active = w.durationS != null && w.durationS > 0 ? Math.round(w.durationS) : elapsedTimeS;
  return {
    source: "healthkit",
    sourceExternalId: w.id,
    type,
    // Only runs go on a treadmill here; an indoor walk is still a walk, counted like any other.
    environment: type === "run" && w.indoor ? "treadmill" : "outdoor",
    startedAt: new Date(w.startTime).toISOString(),
    endedAt: new Date(w.endTime).toISOString(),
    distanceM: Math.max(0, w.distanceM),
    movingTimeS: Math.max(1, Math.min(active, elapsedTimeS)),
    elapsedTimeS,
    ...(w.deviceName ? { deviceName: w.deviceName.slice(0, 120) } : {}),
    evidenceCount: 0,
  };
}

/** A HealthKit quantity in meters or seconds; null for a unit we don't know. */
export function healthKitQuantity(q: { unit: string; quantity: number } | null | undefined, kind: "distance" | "time"): number | null {
  if (!q || !Number.isFinite(q.quantity)) return null;
  const factors: Record<string, number> =
    kind === "distance"
      ? { m: 1, km: 1000, mi: 1609.344, ft: 0.3048, yd: 0.9144, cm: 0.01 }
      : { s: 1, min: 60, hr: 3600, h: 3600, ms: 0.001 };
  const f = factors[q.unit];
  return f == null ? null : q.quantity * f;
}
