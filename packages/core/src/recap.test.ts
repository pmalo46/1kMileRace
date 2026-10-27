import { describe, expect, it } from "vitest";
import { overtakes, placeChangesSince, recapSnapshot, sinceLastLook, type RecapStanding } from "./recap.ts";
import { milesToMeters } from "./units.ts";

const GOAL = milesToMeters(1000);
const runner = (id: string, miles: number, runs: number, finished_at: string | null = null): RecapStanding => ({
  user_id: id,
  counted_distance_m: milesToMeters(Math.min(miles, 1000)),
  counted_moving_time_s: miles * 600,
  finished_at,
  finish_moving_time_s: finished_at ? 600_000 : null,
  total_distance_m: milesToMeters(miles),
  activity_count: runs,
});
const ids = (list: { user_id: string }[]) => list.map((s) => s.user_id);

describe("overtakes", () => {
  it("finds who you passed and who passed you, nearest first", () => {
    const before = [runner("me", 100, 10), runner("ann", 104, 10), runner("bo", 102, 10), runner("cy", 98, 10)];
    const after = [runner("me", 106, 11), runner("ann", 104, 10), runner("bo", 102, 10), runner("cy", 108, 11)];
    expect(overtakes(before, after, "me")).toMatchObject({ youPassed: [{ user_id: "ann" }, { user_id: "bo" }], passedYou: [{ user_id: "cy" }] });
  });

  it("counts finishing as passing, and ignores runners who weren't there before", () => {
    const before = [runner("me", 999, 10), runner("ann", 999.5, 10)];
    const after = [runner("me", 1003, 11, "2026-10-20T10:00:00Z"), runner("ann", 999.5, 10), runner("new", 1200, 3)];
    expect(ids(overtakes(before, after, "me").youPassed)).toEqual(["ann"]);
    expect(overtakes(before, after, "me").passedYou).toEqual([]);
  });

  it("knows nothing about a runner missing from either side", () => {
    expect(overtakes([], [runner("me", 5, 1)], "me")).toEqual({ youPassed: [], passedYou: [] });
  });
});

describe("place changes since a look", () => {
  it("compares places on the distance board", () => {
    const before = [runner("a", 10, 1), runner("b", 8, 1), runner("c", 6, 1)];
    const after = [runner("a", 10, 1), runner("b", 8, 1), runner("c", 12, 2)];
    expect(placeChangesSince(before, after)).toEqual(new Map([["c", 2], ["a", -1], ["b", -1]]));
  });
});

describe("since you last looked", () => {
  const before = [runner("me", 90, 9), runner("ann", 245, 30), runner("bo", 990, 99), runner("cy", 95, 9)];

  it("leads with the crew's miles and gathers milestones, finishes and new faces", () => {
    const after = [
      runner("me", 93, 10),
      runner("ann", 251, 31),
      runner("bo", 1004, 100, "2026-10-25T09:00:00Z"),
      runner("cy", 95, 9),
      runner("dee", 2, 1),
    ];
    const recap = sinceLastLook(before, after, "me", GOAL)!;
    expect(recap.crewM).toBeCloseTo(milesToMeters(3 + 6 + 14 + 2));
    expect(ids(recap.movers)).toEqual(["me", "ann", "bo", "dee"]);
    expect(recap.milestones.map((m) => [m.standing.user_id, m.miles])).toEqual([["ann", 250], ["dee", 1]]);
    expect(ids(recap.finished)).toEqual(["bo"]);
    expect(ids(recap.joined)).toEqual(["dee"]);
    expect(recap.youPassed).toEqual([]);
    expect(recap.passedYou).toEqual([]);
  });

  it("keeps only the highest milestone a runner crossed", () => {
    const recap = sinceLastLook([runner("me", 0.5, 1)], [runner("me", 60, 9)], "me", GOAL)!;
    expect(recap.milestones.map((m) => m.miles)).toEqual([50]);
  });

  it("is null when nothing happened", () => {
    expect(sinceLastLook(before, before, "me", GOAL)).toBeNull();
  });

  it("snapshots only what it needs", () => {
    const withProfile = { ...runner("me", 1, 1), profile: { display_name: "Me" } };
    expect(recapSnapshot([withProfile])[0]).not.toHaveProperty("profile");
  });
});
