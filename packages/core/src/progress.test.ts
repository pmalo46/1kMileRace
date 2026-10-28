import { describe, expect, it } from "vitest";
import { finishPlan, isResultOfficial, paceStatus, projectedGoalMovingTimeS, runsPerWeekSoFar } from "./progress.ts";
import { DEFAULT_GOAL_M } from "./types.ts";
import { formatDuration, formatMiles, formatPace, metersToMiles, milesToMeters } from "./units.ts";

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

describe("finishPlan", () => {
  const mid = new Date((race.startsAt.getTime() + race.endsAt.getTime()) / 2);

  it("spreads what's left over the runs still to come", () => {
    const plan = finishPlan(milesToMeters(500), race, 4, mid)!;
    const weeksLeft = 182.5 / 7;
    expect(metersToMiles(plan.perRunM)).toBeCloseTo(500 / (weeksLeft * 4), 5);
  });

  it("asks more of each run the fewer runs a week there are", () => {
    const four = finishPlan(milesToMeters(500), race, 4, mid)!.perRunM;
    const three = finishPlan(milesToMeters(500), race, 3, mid)!.perRunM;
    expect(three / four).toBeCloseTo(4 / 3, 5);
  });

  it("projects the finish from the average so far", () => {
    const ahead = finishPlan(milesToMeters(600), race, 4, mid)!;
    expect(ahead.onTrack).toBe(true);
    // 600 miles in half a year is 1,000 in about 0.83 of a year.
    const atYear = (ahead.projectedFinish!.getTime() - race.startsAt.getTime()) / (race.endsAt.getTime() - race.startsAt.getTime());
    expect(atYear).toBeCloseTo(500 / 600, 5);
    expect(finishPlan(milesToMeters(400), race, 4, mid)!.onTrack).toBe(false);
  });

  it("has no projection before the first mile, and no plan once it's over", () => {
    const start = finishPlan(0, race, 4, race.startsAt)!;
    expect(start.projectedFinish).toBeNull();
    expect(start.onTrack).toBe(false);
    expect(finishPlan(DEFAULT_GOAL_M, race, 4, mid)).toBeNull();
    expect(finishPlan(milesToMeters(500), race, 4, race.endsAt)).toBeNull();
  });

  it("never asks a single run to cover less than all of what's left in the last days", () => {
    const lastDay = new Date(race.endsAt.getTime() - 86_400_000);
    const plan = finishPlan(milesToMeters(990), race, 4, lastDay)!;
    expect(metersToMiles(plan.perRunM)).toBeCloseTo(10, 5);
  });
});

describe("runsPerWeekSoFar", () => {
  it("averages runs over the weeks since the start, from 1 to 7", () => {
    const fourWeeksIn = new Date(race.startsAt.getTime() + 28 * 86_400_000);
    expect(runsPerWeekSoFar(13, race.startsAt, fourWeeksIn)).toBe(3);
    expect(runsPerWeekSoFar(0, race.startsAt, fourWeeksIn)).toBe(1);
    expect(runsPerWeekSoFar(60, race.startsAt, fourWeeksIn)).toBe(7);
  });

  it("treats the first few days as a full week", () => {
    expect(runsPerWeekSoFar(2, race.startsAt, new Date(race.startsAt.getTime() + 86_400_000))).toBe(2);
  });
});
