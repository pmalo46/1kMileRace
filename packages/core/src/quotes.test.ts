import { describe, expect, it } from "vitest";
import { MILESTONE_MILES, formatQuote, milestoneQuote, quoteOfTheDay, runQuote } from "./quotes.ts";

describe("quotes", () => {
  it("has a quote of its own for every milestone", () => {
    const texts = MILESTONE_MILES.map((m) => milestoneQuote(m).text);
    expect(new Set(texts).size).toBe(MILESTONE_MILES.length);
    expect(milestoneQuote(1).author).toBe("Lao Tzu");
  });

  it("marks every hundred miles, the quarters, and the last stretch", () => {
    expect([...MILESTONE_MILES]).toEqual([
      1, 100, 200, 250, 300, 400, 500, 600, 700, 750, 800, 900, 950, 975, 990, 995, 1000,
    ]);
  });

  it("still has something to say at a milestone it doesn't know", () => {
    expect(milestoneQuote(42).text.length).toBeGreaterThan(0);
  });

  it("keeps the same quote all day and changes it the next", () => {
    const morning = quoteOfTheDay(new Date(2026, 9, 13, 6, 0));
    const night = quoteOfTheDay(new Date(2026, 9, 13, 23, 30));
    const tomorrow = quoteOfTheDay(new Date(2026, 9, 14, 6, 0));
    expect(night).toEqual(morning);
    expect(tomorrow).not.toEqual(morning);
  });

  it("goes fifty days without repeating a quote of the day", () => {
    const fifty = Array.from({ length: 50 }, (_, day) => quoteOfTheDay(new Date(2026, 9, 13 + day, 12, 0)).text);
    expect(new Set(fifty).size).toBe(50);
  });

  it("picks run quotes from the seed, whatever its sign or size", () => {
    expect(runQuote("before", 3)).toEqual(runQuote("before", 3));
    expect(runQuote("after", -5).text.length).toBeGreaterThan(0);
    expect(runQuote("after", 1_791_913_330_493).text.length).toBeGreaterThan(0);
    expect(runQuote("before", 0)).not.toEqual(runQuote("after", 0));
  });

  it("formats attributed and unattributed quotes for a single line", () => {
    expect(formatQuote({ text: "Slow and steady wins the race.", author: "Aesop" })).toBe(
      "“Slow and steady wins the race.” — Aesop",
    );
    expect(formatQuote({ text: "Slow miles are still miles." })).toBe("Slow miles are still miles.");
  });
});
