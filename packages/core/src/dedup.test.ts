import { describe, expect, it } from "vitest";
import { overlapRatio, resolveDuplicates, type TimedActivity } from "./dedup.ts";

const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 2, h, m));
const act = (source: TimedActivity["source"], start: Date, end: Date, polyline?: string): TimedActivity => ({
  source,
  startedAt: start,
  endedAt: end,
  polyline,
});

describe("overlapRatio", () => {
  it("is relative to the shorter activity", () => {
    expect(overlapRatio(act("file", at(12), at(13)), act("file", at(12, 30), at(12, 45)))).toBe(1);
    expect(overlapRatio(act("file", at(12), at(13)), act("file", at(12, 30), at(13, 30)))).toBe(0.5);
    expect(overlapRatio(act("file", at(12), at(13)), act("file", at(13), at(14)))).toBe(0);
  });
});

describe("resolveDuplicates", () => {
  const appRun = act("app_gps", at(12), at(12, 30));

  it("inserts when nothing overlaps", () => {
    expect(resolveDuplicates(act("healthkit", at(15), at(15, 30)), [appRun])).toEqual({ action: "insert" });
  });

  it("skips a watch import of a run already recorded in-app", () => {
    const watch = act("healthkit", at(12, 1), at(12, 31), "route");
    expect(resolveDuplicates(watch, [appRun])).toEqual({ action: "skip", duplicateOf: appRun });
  });

  it("replaces a lower-quality copy with a better one", () => {
    const noRoute = act("healthkit", at(12), at(12, 30));
    const withRoute = act("file", at(12), at(12, 30));
    expect(resolveDuplicates(appRun, [noRoute, withRoute])).toEqual({
      action: "replace",
      replaces: [noRoute, withRoute],
    });
  });

  it("does not treat back-to-back activities as duplicates", () => {
    expect(resolveDuplicates(act("app_gps", at(12, 29), at(13)), [appRun])).toEqual({ action: "insert" });
  });
});
