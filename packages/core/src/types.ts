import { z } from "zod";
import { METERS_PER_MILE } from "./units.ts";

export const ActivitySource = z.enum([
  "app_gps",
  "healthkit",
  "health_connect",
  "file",
  "treadmill_manual",
  "polar",
  /** Outdoor run or walk typed in by hand (until GPS recording and health sync land). */
  "manual",
]);
export type ActivitySource = z.infer<typeof ActivitySource>;

export const ActivityType = z.enum(["run", "walk"]);
export type ActivityType = z.infer<typeof ActivityType>;

export const Environment = z.enum(["outdoor", "treadmill"]);
export type Environment = z.infer<typeof Environment>;

export const Verification = z.enum(["gps", "device", "photo", "pending", "rejected"]);
export type Verification = z.infer<typeof Verification>;

export const ActivityInput = z
  .object({
    source: ActivitySource,
    sourceExternalId: z.string().min(1).max(200).optional(),
    type: ActivityType,
    environment: Environment,
    startedAt: z.coerce.date(),
    endedAt: z.coerce.date(),
    distanceM: z.number().nonnegative(),
    movingTimeS: z.number().int().nonnegative(),
    elapsedTimeS: z.number().int().nonnegative(),
    elevationGainM: z.number().nonnegative().optional(),
    avgHeartRate: z.number().positive().optional(),
    deviceName: z.string().max(120).optional(),
    /** Google encoded polyline of the route, if any. */
    polyline: z.string().optional(),
    /** Number of photos attached as treadmill evidence. */
    evidenceCount: z.number().int().nonnegative().default(0),
    /** Taken-at timestamp from the evidence photo's EXIF data, if readable. */
    evidenceTakenAt: z.coerce.date().optional(),
    /** Android reported that a fix came from a mock-location (GPS spoofing) app. */
    mockedLocation: z.boolean().optional(),
  })
  .strict();
export type ActivityInput = z.infer<typeof ActivityInput>;

export const RaceRules = z.object({
  minDistanceM: z.number().positive(),
  allowedTypes: z.array(ActivityType).min(1),
  allowTreadmill: z.boolean(),
  requireTreadmillPhoto: z.boolean(),
  /** Paces faster than this (sec/mile) are flagged for review. */
  fastestPaceSecPerMile: z.number().positive(),
  /** Paces slower than this (sec/mile) are flagged for review. */
  slowestPaceSecPerMile: z.number().positive(),
  /** moving / elapsed below this ratio is flagged as a stop-and-go outing. */
  minMovingRatio: z.number().min(0).max(1),
  /** Activities must be logged within this many days of finishing. */
  lateLogDays: z.number().int().nonnegative(),
});
export type RaceRules = z.infer<typeof RaceRules>;

export const DEFAULT_RACE_RULES: RaceRules = {
  minDistanceM: METERS_PER_MILE,
  allowedTypes: ["run", "walk"],
  allowTreadmill: true,
  requireTreadmillPhoto: true,
  fastestPaceSecPerMile: 4 * 60,
  slowestPaceSecPerMile: 30 * 60,
  minMovingRatio: 0.7,
  lateLogDays: 7,
};

export const DEFAULT_GOAL_M = 1000 * METERS_PER_MILE;
export const RACE_LENGTH_DAYS = 365;
