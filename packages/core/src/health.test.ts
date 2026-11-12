import { describe, expect, it } from "vitest";
import {
  APPLE_WORKOUT,
  HEALTH_CONNECT_EXERCISE,
  activityFromAppleWorkout,
  activityFromHealthSession,
  healthKitQuantity,
  type AppleWorkout,
  type HealthSession,
} from "./health.ts";
import { evaluateActivity } from "./rules.ts";
import { ActivityInput, DEFAULT_RACE_RULES } from "./types.ts";
import { milesToMeters } from "./units.ts";

const session = (overrides: Partial<HealthSession> = {}): HealthSession => ({
  id: "hc-1",
  exerciseType: HEALTH_CONNECT_EXERCISE.RUNNING,
  startTime: "2026-10-12T12:00:00Z",
  endTime: "2026-10-12T12:30:00Z",
  distanceM: milesToMeters(3.1),
  ...overrides,
});

describe("activityFromHealthSession", () => {
  it("maps a watch run to an activity the server recognises on re-import", () => {
    expect(activityFromHealthSession(session({ activeS: 1700, deviceName: "Forerunner 265" }))).toEqual({
      source: "health_connect",
      sourceExternalId: "hc-1",
      type: "run",
      environment: "outdoor",
      startedAt: "2026-10-12T12:00:00.000Z",
      endedAt: "2026-10-12T12:30:00.000Z",
      distanceM: milesToMeters(3.1),
      movingTimeS: 1700,
      elapsedTimeS: 1800,
      deviceName: "Forerunner 265",
      evidenceCount: 0,
    });
  });

  it("recognises walks and treadmill runs", () => {
    expect(activityFromHealthSession(session({ exerciseType: HEALTH_CONNECT_EXERCISE.WALKING }))).toMatchObject({
      type: "walk",
      environment: "outdoor",
    });
    expect(
      activityFromHealthSession(session({ exerciseType: HEALTH_CONNECT_EXERCISE.RUNNING_TREADMILL })),
    ).toMatchObject({ type: "run", environment: "treadmill" });
  });

  it("ignores workouts that aren't runs or walks", () => {
    expect(activityFromHealthSession(session({ exerciseType: 8 }))).toBeNull(); // biking
  });

  it("treats the whole session as moving when no active time is reported, and never more than elapsed", () => {
    expect(activityFromHealthSession(session())!.movingTimeS).toBe(1800);
    expect(activityFromHealthSession(session({ activeS: 9999 }))!.movingTimeS).toBe(1800);
  });

  it("rejects sessions with unusable times", () => {
    expect(activityFromHealthSession(session({ endTime: "2026-10-12T12:00:00Z" }))).toBeNull();
    expect(activityFromHealthSession(session({ endTime: "not a date" }))).toBeNull();
  });

  it("counts a watch-recorded treadmill run without a console photo", () => {
    const imported = activityFromHealthSession(session({ exerciseType: HEALTH_CONNECT_EXERCISE.RUNNING_TREADMILL }))!;
    const result = evaluateActivity(ActivityInput.parse(imported), DEFAULT_RACE_RULES, new Date("2026-10-12T18:00:00Z"));
    expect(result).toEqual({ status: "accepted", verification: "device", issues: [] });
  });
});

const workout = (overrides: Partial<AppleWorkout> = {}): AppleWorkout => ({
  id: "6F1C-UUID",
  activityType: APPLE_WORKOUT.RUNNING,
  startTime: "2026-10-12T12:00:00Z",
  endTime: "2026-10-12T12:30:00Z",
  distanceM: milesToMeters(3.1),
  ...overrides,
});

describe("activityFromAppleWorkout", () => {
  it("maps an Apple Watch run, leaving paused time out of moving time", () => {
    expect(activityFromAppleWorkout(workout({ durationS: 1700, deviceName: "Apple Watch" }))).toEqual({
      source: "healthkit",
      sourceExternalId: "6F1C-UUID",
      type: "run",
      environment: "outdoor",
      startedAt: "2026-10-12T12:00:00.000Z",
      endedAt: "2026-10-12T12:30:00.000Z",
      distanceM: milesToMeters(3.1),
      movingTimeS: 1700,
      elapsedTimeS: 1800,
      deviceName: "Apple Watch",
      evidenceCount: 0,
    });
  });

  it("treats an indoor run as a treadmill run and an indoor walk as a walk", () => {
    expect(activityFromAppleWorkout(workout({ indoor: true }))!.environment).toBe("treadmill");
    const walk = activityFromAppleWorkout(workout({ activityType: APPLE_WORKOUT.WALKING, indoor: true }))!;
    expect([walk.type, walk.environment]).toEqual(["walk", "outdoor"]);
  });

  it("ignores everything that isn't a run or a walk", () => {
    expect(activityFromAppleWorkout(workout({ activityType: 13 }))).toBeNull(); // cycling
    expect(activityFromAppleWorkout(workout({ activityType: 24 }))).toBeNull(); // hiking
    expect(activityFromAppleWorkout(workout({ endTime: "2026-10-12T12:00:00Z" }))).toBeNull();
  });

  it("passes the race rules like any watch run", () => {
    const a = ActivityInput.parse(activityFromAppleWorkout(workout()));
    expect(evaluateActivity(a, DEFAULT_RACE_RULES, new Date("2026-10-12T13:00:00Z")).status).toBe("accepted");
  });
});

describe("healthKitQuantity", () => {
  it("converts HealthKit units to meters and seconds", () => {
    expect(healthKitQuantity({ unit: "mi", quantity: 2 }, "distance")).toBeCloseTo(3218.688);
    expect(healthKitQuantity({ unit: "km", quantity: 5 }, "distance")).toBe(5000);
    expect(healthKitQuantity({ unit: "min", quantity: 30 }, "time")).toBe(1800);
    expect(healthKitQuantity({ unit: "furlong", quantity: 1 }, "distance")).toBeNull();
    expect(healthKitQuantity(undefined, "time")).toBeNull();
  });
});
