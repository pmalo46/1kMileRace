import { describe, expect, it } from "vitest";
import { gaitOf, raceStats, type StatActivity } from "./stats.ts";
import { milesToMeters } from "./units.ts";

// The race starts on Thursday 1 October 2026; 20 October is a Tuesday in its fourth week.
const race = { startsAt: new Date(2026, 9, 1), endsAt: new Date(2027, 9, 1), goalM: milesToMeters(1000) };
const now = new Date(2026, 9, 20, 15, 0);

const act = (at: Date, miles: number, minPerMile: number, extra: Partial<StatActivity> = {}): StatActivity => ({
  startedAt: at,
  distanceM: milesToMeters(miles),
  movingTimeS: miles * minPerMile * 60,
  environment: "outdoor",
  elevationGainM: null,
  ...extra,
});

describe("run or walk", () => {
  it("goes by pace, with 15:00 a mile still a run", () => {
    expect(gaitOf(act(now, 1, 14))).toBe("run");
    expect(gaitOf(act(now, 1, 15))).toBe("run");
    expect(gaitOf(act(now, 1, 15.5))).toBe("walk");
  });

  it("splits distance and pace between runs and walks", () => {
    const s = raceStats([act(now, 3, 10), act(now, 1, 18)], race, now);
    expect(s.gait.run.count).toBe(1);
    expect(s.gait.walk.count).toBe(1);
    expect(s.gait.runShare).toBeCloseTo(0.75);
    expect(s.gait.run.paceS).toBeCloseTo(600);
    expect(s.gait.walk.paceS).toBeCloseTo(18 * 60);
  });
});

describe("weeks", () => {
  it("numbers Monday weeks from the race start and puts Sunday night in the week before", () => {
    const s = raceStats([act(new Date(2026, 9, 18, 23), 5, 10), act(new Date(2026, 9, 19, 6), 3, 10)], race, now);
    expect(s.weeks.map((w) => w.number)).toEqual([1, 2, 3, 4]);
    expect(s.weeks[0]!.start).toEqual(new Date(2026, 8, 28));
    expect(s.weeks[2]!.distanceM).toBeCloseTo(milesToMeters(5));
    expect(s.weeks[3]!.distanceM).toBeCloseTo(milesToMeters(3));
    expect(s.weeks[3]!.cumulativeM).toBeCloseTo(milesToMeters(8));
  });

  it("finds the biggest week and the one with the most time on their feet", () => {
    const s = raceStats(
      [act(new Date(2026, 9, 6), 10, 8), act(new Date(2026, 9, 13), 8, 16)],
      race,
      now,
    );
    expect(s.bestWeek!.number).toBe(2);
    expect(s.toughestWeek!.number).toBe(3);
  });

  it("compares early run pace with recent run pace", () => {
    const s = raceStats(
      [
        act(new Date(2026, 9, 1), 3, 10),
        act(new Date(2026, 9, 6), 3, 10),
        act(new Date(2026, 9, 13), 3, 9.5),
        act(new Date(2026, 9, 19), 3, 9.5),
      ],
      race,
      now,
    );
    expect(s.paceChangeS).toBeCloseTo(30);
    expect(raceStats([act(now, 3, 10)], race, now).paceChangeS).toBeNull();
  });
});

describe("streaks", () => {
  it("counts days in a row, longest and current", () => {
    const days = [15, 16, 17, 19, 20].map((d) => act(new Date(2026, 9, d, 7), 2, 10));
    const s = raceStats(days, race, now);
    expect(s.dayStreak).toEqual({ current: 2, longest: 3 });
    expect(s.activeDays).toBe(5);
  });

  it("keeps a streak alive until today is over", () => {
    const s = raceStats([act(new Date(2026, 9, 18, 7), 2, 10), act(new Date(2026, 9, 19, 7), 2, 10)], race, now);
    expect(s.dayStreak.current).toBe(2);
  });

  it("counts weeks in a row with an activity", () => {
    const s = raceStats([act(new Date(2026, 9, 6), 2, 10), act(new Date(2026, 9, 13), 2, 10)], race, now);
    // Weeks 2 and 3 ran; week 4 is still going.
    expect(s.weekStreak).toEqual({ current: 2, longest: 2 });
  });
});

describe("records and the rest", () => {
  it("ignores short blips for the fastest pace", () => {
    const s = raceStats([act(now, 0.5, 5), act(now, 3, 9), act(now, 6, 11)], race, now);
    expect(s.fastest!.paceS).toBeCloseTo(9 * 60);
    expect(s.longest!.distanceM).toBeCloseTo(milesToMeters(6));
  });

  it("only reports climbing when an activity recorded it", () => {
    expect(raceStats([act(now, 3, 10)], race, now).climbM).toBeNull();
    const s = raceStats([act(now, 3, 10, { elevationGainM: 40 }), act(now, 3, 10, { elevationGainM: 60 })], race, now);
    expect(s.climbM).toBe(100);
    expect(s.biggestClimb!.elevationGainM).toBe(60);
  });

  it("splits treadmill and outdoor miles and finds favorite times", () => {
    const s = raceStats(
      [
        act(new Date(2026, 9, 13, 6), 4, 10, { environment: "treadmill" }),
        act(new Date(2026, 9, 14, 6), 2, 10),
        act(new Date(2026, 9, 15, 19), 2, 10),
      ],
      race,
      now,
    );
    expect(s.treadmillM).toBeCloseTo(milesToMeters(4));
    expect(s.outdoorM).toBeCloseTo(milesToMeters(4));
    expect(s.favoriteDayPart).toBe("Morning");
    expect(s.favoriteWeekday).toBe("Tuesday");
  });

  it("is empty before any activity", () => {
    const s = raceStats([], race, now);
    expect(s.count).toBe(0);
    expect(s.bestWeek).toBeNull();
    expect(s.favoriteDayPart).toBeNull();
    expect(s.dayStreak).toEqual({ current: 0, longest: 0 });
  });
});
