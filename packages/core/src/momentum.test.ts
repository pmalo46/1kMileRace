import { describe, expect, it } from "vitest";
import { nextMilestone, passedBy, placeChanges, rivalAhead, runsToCover, startOfWeek, weekDays, weekdayIndex } from "./momentum.ts";
import { milesToMeters } from "./units.ts";

const GOAL = milesToMeters(1000);
const runner = (id: string, miles: number, finished_at: string | null = null) => ({
  user_id: id,
  counted_distance_m: milesToMeters(miles),
  counted_moving_time_s: miles * 600,
  finished_at,
  finish_moving_time_s: null,
});

describe("weeks", () => {
  // 13 October 2026 is a Tuesday.
  const tuesday = new Date(2026, 9, 13, 15, 0);

  it("starts the week on Monday", () => {
    expect(startOfWeek(tuesday)).toEqual(new Date(2026, 9, 12));
    expect(startOfWeek(new Date(2026, 9, 18, 23, 0))).toEqual(new Date(2026, 9, 12)); // Sunday night
    expect(weekdayIndex(tuesday)).toBe(1);
  });

  it("marks the days of this week that had a run", () => {
    const ran = weekDays([new Date(2026, 9, 12, 7), new Date(2026, 9, 13, 6), new Date(2026, 9, 11, 9)], tuesday);
    expect(ran).toEqual([true, true, false, false, false, false, false]); // last Sunday's run is last week's
  });
});

describe("milestones ahead", () => {
  it("finds the next milestone and the distance to it", () => {
    const next = nextMilestone(milesToMeters(110.3), GOAL)!;
    expect(next.miles).toBe(200);
    expect(next.toGoM).toBeCloseTo(milesToMeters(89.7));
    expect(nextMilestone(0, GOAL)!.miles).toBe(1);
    expect(nextMilestone(milesToMeters(996), GOAL)!.miles).toBe(1000);
    expect(nextMilestone(GOAL, GOAL)).toBeNull();
  });

  it("doesn't count a milestone the runner is standing on", () => {
    expect(nextMilestone(milesToMeters(100), GOAL)!.miles).toBe(200);
  });

  it("counts the runs of a given length still needed", () => {
    expect(runsToCover(milesToMeters(89.7), milesToMeters(3.1))).toBe(29);
    expect(runsToCover(milesToMeters(0.2), milesToMeters(3.1))).toBe(1);
    expect(runsToCover(milesToMeters(5), 0)).toBeNull();
  });
});

describe("the people around you", () => {
  const field = [runner("ann", 112.1), runner("me", 110.3), runner("sam", 108.9), runner("zed", 1000, "2026-09-01T00:00:00Z")];

  it("names the runner just ahead and the gap, ignoring finishers", () => {
    const rival = rivalAhead(field, "me")!;
    expect(rival.standing.user_id).toBe("ann");
    expect(rival.gapM).toBeCloseTo(milesToMeters(1.8));
    expect(rivalAhead(field, "ann")).toBeNull();
  });

  it("shows who moved up and down since this morning", () => {
    // I ran 3.1 today, which took me past Sam.
    const moved = placeChanges(field, new Map([["me", milesToMeters(3.1)]]));
    expect(moved.get("me")).toBe(1);
    expect(moved.get("sam")).toBe(-1);
    expect(moved.get("ann")).toBe(0);
    expect(moved.get("zed")).toBe(0);
  });

  it("lists who a run overtook, nearest first", () => {
    expect(passedBy(field, "me", milesToMeters(3.1)).map((s) => s.user_id)).toEqual(["sam"]);
    expect(passedBy(field, "me", milesToMeters(0.5))).toEqual([]);
  });
});
