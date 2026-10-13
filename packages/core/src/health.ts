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
  source: "health_connect";
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
