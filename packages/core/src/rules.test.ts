import { describe, expect, it } from "vitest";
import { evaluateActivity } from "./rules";
import { ActivityInput, DEFAULT_RACE_RULES, type RaceRules } from "./types";
import { milesToMeters } from "./units";

const now = new Date("2026-10-02T18:00:00Z");

function run(overrides: Partial<ActivityInput> = {}): ActivityInput {
  return ActivityInput.parse({
    source: "app_gps",
    type: "run",
    environment: "outdoor",
    startedAt: "2026-10-02T12:00:00Z",
    endedAt: "2026-10-02T12:30:00Z",
    distanceM: milesToMeters(3.1),
    movingTimeS: 28 * 60,
    elapsedTimeS: 30 * 60,
    ...overrides,
  });
}

const codes = (a: ActivityInput, rules: RaceRules = DEFAULT_RACE_RULES) =>
  evaluateActivity(a, rules, now).issues.map((i) => i.code);

describe("evaluateActivity", () => {
  it("accepts a normal GPS run as gps-verified", () => {
    expect(evaluateActivity(run(), DEFAULT_RACE_RULES, now)).toEqual({
      status: "accepted",
      verification: "gps",
      issues: [],
    });
  });

  it("treats imported watch workouts without a route as device-verified", () => {
    expect(evaluateActivity(run({ source: "healthkit" }), DEFAULT_RACE_RULES, now).verification).toBe("device");
    expect(
      evaluateActivity(run({ source: "healthkit", polyline: "abc" }), DEFAULT_RACE_RULES, now).verification,
    ).toBe("gps");
  });

  it("enforces the 1 mile minimum", () => {
    const r = evaluateActivity(run({ distanceM: milesToMeters(0.99), movingTimeS: 9 * 60 }), DEFAULT_RACE_RULES, now);
    expect(r.status).toBe("rejected");
    expect(r.issues.map((i) => i.code)).toContain("too_short");
    expect(codes(run({ distanceM: milesToMeters(1), movingTimeS: 10 * 60 }))).not.toContain("too_short");
  });

  it("flags implausibly fast and slow paces without rejecting them", () => {
    const fast = evaluateActivity(run({ movingTimeS: 6 * 60, elapsedTimeS: 6 * 60 }), DEFAULT_RACE_RULES, now);
    expect(fast.status).toBe("flagged");
    expect(fast.verification).toBe("pending");
    expect(fast.issues.map((i) => i.code)).toEqual(["pace_too_fast"]);

    const errands = run({
      distanceM: milesToMeters(1.2),
      endedAt: new Date("2026-10-02T12:40:00Z"),
      movingTimeS: 40 * 60,
      elapsedTimeS: 40 * 60,
    });
    expect(codes(errands)).toEqual(["pace_too_slow"]);
  });

  it("flags stop-and-go outings", () => {
    expect(codes(run({ movingTimeS: 20 * 60, elapsedTimeS: 30 * 60 }))).toEqual(["too_much_stopping"]);
  });

  it("rejects activity types the race doesn't allow", () => {
    expect(codes(run({ type: "walk" }), { ...DEFAULT_RACE_RULES, allowedTypes: ["run"] })).toContain(
      "type_not_allowed",
    );
  });

  it("requires a console photo for treadmill runs and always sends them to review", () => {
    const noPhoto = run({ source: "treadmill_manual", environment: "treadmill" });
    expect(evaluateActivity(noPhoto, DEFAULT_RACE_RULES, now).status).toBe("rejected");

    const withPhoto = evaluateActivity({ ...noPhoto, evidenceCount: 1 }, DEFAULT_RACE_RULES, now);
    expect(withPhoto).toEqual({ status: "flagged", verification: "pending", issues: [] });
  });

  it("flags treadmill photos taken far from the workout time", () => {
    const a = run({
      source: "treadmill_manual",
      environment: "treadmill",
      evidenceCount: 1,
      evidenceTakenAt: new Date("2026-09-20T12:00:00Z"),
    });
    expect(codes(a)).toEqual(["photo_time_mismatch"]);
  });

  it("rejects treadmill runs when the race disallows them", () => {
    const a = run({ source: "treadmill_manual", environment: "treadmill", evidenceCount: 1 });
    expect(codes(a, { ...DEFAULT_RACE_RULES, allowTreadmill: false })).toContain("treadmill_not_allowed");
  });

  it("rejects future, inconsistent, and late-logged activities", () => {
    expect(codes(run({ startedAt: new Date("2026-10-03T12:00:00Z"), endedAt: new Date("2026-10-03T12:30:00Z") })))
      .toContain("in_future");
    expect(codes(run({ movingTimeS: 40 * 60 }))).toContain("bad_times");
    expect(codes(run({ startedAt: new Date("2026-09-20T12:00:00Z"), endedAt: new Date("2026-09-20T12:30:00Z") })))
      .toContain("logged_too_late");
  });
});
