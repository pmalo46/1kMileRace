import { describe, expect, it } from "vitest";
import { cheerPush, commentPush, milestonePush, overtakePush, ownMilestonePush } from "./push.ts";
import { milesToMeters } from "./units.ts";

const run = { id: "f1", type: "activity" as const, activity: { type: "run" as const, distanceM: milesToMeters(3.25) } };

describe("push messages", () => {
  it("describes a cheer on a run and opens its thread", () => {
    expect(cheerPush("Sam", "🔥", run)).toEqual({
      title: "Sam cheered 🔥",
      body: "For your 3.2 mile run.",
      url: "/comments?item=f1",
    });
  });

  it("describes cheers on milestones, finishes and joins", () => {
    expect(cheerPush("Sam", "🎉", { id: "f2", type: "milestone", miles: 1000 }).body).toBe("For you hitting 1,000 miles.");
    expect(cheerPush("Sam", "🎉", { id: "f3", type: "finish", miles: 1000 }).body).toBe("For you finishing the race.");
    expect(cheerPush("Sam", "👋", { id: "f4", type: "joined" }).body).toBe("For you joining the race.");
  });

  it("words a comment differently for the owner and for others in the thread", () => {
    expect(commentPush("Sam", "  Nice\nwork! ", run, true)).toEqual({
      title: "Sam commented on your 3.2 mile run",
      body: "Nice work!",
      url: "/comments?item=f1",
    });
    expect(commentPush("Sam", "Nice work!", run, false).title).toBe("Sam also commented");
  });

  it("trims long comments", () => {
    const { body } = commentPush("Sam", "a".repeat(500), run, true);
    expect(body).toHaveLength(140);
    expect(body.endsWith("…")).toBe(true);
  });

  it("announces milestones and finishes to the race", () => {
    expect(milestonePush("Ann", "milestone", 500, "Neighborhood 1K")).toEqual({
      title: "Ann hit 500 miles 🎉",
      body: "Send a cheer in Neighborhood 1K.",
      url: "/feed",
    });
    expect(milestonePush("Ann", "milestone", 1, "Neighborhood 1K").title).toBe("Ann hit 1 mile 🎉");
    expect(milestonePush("Ann", "finish", 1000, "Neighborhood 1K")).toEqual({
      title: "Ann finished Neighborhood 1K! 🏁",
      body: "All 1,000 miles. Send congratulations.",
      url: "/feed",
    });
  });

  it("tells the runner about their own milestones and finish", () => {
    expect(ownMilestonePush("milestone", 500, "Neighborhood 1K")).toEqual({
      title: "You hit 500 miles 🎉",
      body: "“To travel hopefully is a better thing than to arrive.” — Robert Louis Stevenson",
      url: "/",
    });
    expect(ownMilestonePush("finish", 1000, "Neighborhood 1K")).toEqual({
      title: "You finished Neighborhood 1K! 🏁",
      body: "“Great is the art of beginning, but greater the art is of ending.” — Henry Wadsworth Longfellow",
      url: "/",
    });
  });
});

describe("overtake pushes", () => {
  it("tells you who moved past you and invites a cheer", () => {
    expect(overtakePush("Sam", "run", milesToMeters(0.35), "Fall 1K", "f9")).toEqual({
      title: "Sam ran past you 🏃",
      body: "0.3 mi apart in Fall 1K. Send a cheer.",
      url: "/comments?item=f9",
    });
  });

  it("speaks of walks as walks, and of tiny gaps kindly", () => {
    const push = overtakePush("Sam", "walk", 50, "Fall 1K", null);
    expect(push.title).toBe("Sam walked past you 🚶");
    expect(push.body).toBe("Neck and neck in Fall 1K. Send a cheer.");
    expect(push.url).toBe("/leaderboard");
  });
});
