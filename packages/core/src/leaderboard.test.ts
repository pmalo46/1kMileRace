import { describe, expect, it } from "vitest";
import { distanceBoard, timeBoard, type StandingLike } from "./leaderboard";
import { DEFAULT_GOAL_M } from "./types";
import { milesToMeters } from "./units";

const s = (
  user_id: string,
  miles: number,
  paceMin: number,
  finished_at: string | null = null,
): StandingLike => {
  const counted = Math.min(miles, 1000);
  return {
    user_id,
    counted_distance_m: milesToMeters(counted),
    counted_moving_time_s: counted * paceMin * 60,
    finished_at,
    finish_moving_time_s: finished_at ? 1000 * paceMin * 60 : null,
  };
};

const field = [
  s("walker", 300, 18),
  s("late-fast-finisher", 1000, 8, "2026-09-01T00:00:00Z"),
  s("early-finisher", 1000, 10, "2026-07-01T00:00:00Z"),
  s("speedy", 200, 7),
  s("newbie", 0, 0),
  s("tied", 300, 12),
];

describe("distanceBoard", () => {
  it("puts finishers first in finish order, then everyone by miles with shared places for ties", () => {
    const rows = distanceBoard(field);
    expect(rows.map((r) => [r.standing.user_id, r.place])).toEqual([
      ["early-finisher", 1],
      ["late-fast-finisher", 2],
      ["walker", 3],
      ["tied", 3],
      ["speedy", 5],
      ["newbie", 6],
    ]);
    expect(rows[0]!.finished).toBe(true);
    expect(rows[2]!.finished).toBe(false);
  });
});

describe("timeBoard", () => {
  it("ranks finishers by moving time and lists projections for everyone else", () => {
    const rows = timeBoard(field, DEFAULT_GOAL_M);
    expect(rows.map((r) => [r.standing.user_id, r.place, r.projected])).toEqual([
      ["late-fast-finisher", 1, false],
      ["early-finisher", 2, false],
      ["speedy", null, true],
      ["tied", null, true],
      ["walker", null, true],
      ["newbie", null, true],
    ]);
    expect(rows[2]!.timeS).toBeCloseTo(1000 * 7 * 60, 3);
    expect(rows[5]!.timeS).toBeNull();
  });
});
