import { describe, expect, it } from "vitest";
import { isResultOfficial, paceStatus, projectedGoalMovingTimeS } from "./progress";
import { DEFAULT_GOAL_M } from "./types";
import { formatDuration, formatMiles, formatPace, metersToMiles, milesToMeters } from "./units";

const race = {
  startsAt: new Date("2026-01-01T05:00:00Z"),
  endsAt: new Date("2027-01-01T05:00:00Z"),
  goalM: DEFAULT_GOAL_M,
};

describe("paceStatus", () => {
  it("needs about 2.74 mi/day at the start", () => {
    const s = paceStatus(0, race, race.startsAt);
    expect(metersToMiles(s.requiredDailyM)).toBeCloseTo(1000 / 365, 5);
    expect(s.expectedM).toBe(0);
  });

  it("reports ahead/behind relative to even pace at the halfway point", () => {
    const mid = new Date((race.startsAt.getTime() + race.endsAt.getTime()) / 2);
    const s = paceStatus(milesToMeters(450), race, mid);
    expect(metersToMiles(s.expectedM)).toBeCloseTo(500, 5);
    expect(metersToMiles(s.aheadByM)).toBeCloseTo(-50, 5);
    expect(metersToMiles(s.requiredDailyM)).toBeCloseTo(550 / 182.5, 5);
  });

  it("needs nothing more once finished", () => {
    const s = paceStatus(DEFAULT_GOAL_M + 5, race, new Date("2026-06-01T00:00:00Z"));
    expect(s.finished).toBe(true);
    expect(s.requiredDailyM).toBe(0);
  });
});

describe("projectedGoalMovingTimeS", () => {
  it("extrapolates the current average pace to the goal", () => {
    expect(projectedGoalMovingTimeS(milesToMeters(10), 100 * 60, DEFAULT_GOAL_M)).toBeCloseTo(1000 * 600, 3);
    expect(projectedGoalMovingTimeS(0, 0, DEFAULT_GOAL_M)).toBeNull();
  });
});

describe("isResultOfficial", () => {
  it("waits out the late-log window", () => {
    const finished = new Date("2026-08-01T12:00:00Z");
    expect(isResultOfficial(finished, 7, new Date("2026-08-08T11:00:00Z"))).toBe(false);
    expect(isResultOfficial(finished, 7, new Date("2026-08-08T13:00:00Z"))).toBe(true);
  });
});

describe("formatting", () => {
  it("formats pace, duration, and miles", () => {
    expect(formatPace(485)).toBe("8:05");
    expect(formatPace(Infinity)).toBe("--:--");
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(formatDuration(723)).toBe("12:03");
    expect(formatMiles(milesToMeters(999.99))).toBe("999.9");
  });
});
