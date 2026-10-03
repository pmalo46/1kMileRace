import { describe, expect, it } from "vitest";
import { planIngest } from "./ingest.ts";
import { ActivityInput, DEFAULT_RACE_RULES } from "./types.ts";
import { milesToMeters } from "./units.ts";

const now = new Date("2026-10-02T18:00:00Z");

function input(overrides: Partial<ActivityInput> = {}): ActivityInput {
  return ActivityInput.parse({
    source: "manual",
    type: "run",
    environment: "outdoor",
    startedAt: "2026-10-02T12:00:00Z",
    endedAt: "2026-10-02T12:30:00Z",
    distanceM: milesToMeters(3.1),
    movingTimeS: 30 * 60,
    elapsedTimeS: 30 * 60,
    ...overrides,
  });
}

const plan = (a: ActivityInput, existing: Parameters<typeof planIngest>[1] = []) =>
  planIngest(a, existing, DEFAULT_RACE_RULES, now);

describe("planIngest", () => {
  it("inserts a hand-entered outdoor run as pending review", () => {
    const p = plan(input());
    expect(p.kind).toBe("insert");
    if (p.kind !== "insert") return;
    expect(p.evaluation.status).toBe("flagged");
    expect(p.row).toMatchObject({
      source: "manual",
      environment: "outdoor",
      started_at: "2026-10-02T12:00:00.000Z",
      ended_at: "2026-10-02T12:30:00.000Z",
      moving_time_s: 1800,
      verification: "pending",
      source_external_id: null,
      polyline: null,
    });
    expect(p.row.flags.map((f) => f.code)).toEqual(["manual_entry"]);
    expect(p.replaces).toEqual([]);
  });

  it("rejects a treadmill run without a photo", () => {
    const p = plan(input({ source: "treadmill_manual", environment: "treadmill" }));
    expect(p.kind).toBe("rejected");
    if (p.kind !== "rejected") return;
    expect(p.evaluation.issues.map((i) => i.code)).toEqual(["treadmill_photo_required"]);
  });

  it("accepts a treadmill run with a photo, pending review, with no issues to show", () => {
    const p = plan(input({ source: "treadmill_manual", environment: "treadmill", evidenceCount: 1 }));
    expect(p.kind).toBe("insert");
    if (p.kind !== "insert") return;
    expect(p.row.verification).toBe("pending");
    expect(p.row.flags).toEqual([]);
  });

  it("skips a run that overlaps one already logged", () => {
    const earlier = {
      id: "a1",
      source: "manual" as const,
      startedAt: new Date("2026-10-02T12:05:00Z"),
      endedAt: new Date("2026-10-02T12:35:00Z"),
    };
    expect(plan(input(), [earlier])).toEqual({ kind: "duplicate", duplicateOf: earlier });
  });

  it("replaces lower-quality copies with a better source, by id", () => {
    const typed = {
      id: "a1",
      source: "manual" as const,
      startedAt: new Date("2026-10-02T12:00:00Z"),
      endedAt: new Date("2026-10-02T12:30:00Z"),
    };
    const p = plan(input({ source: "app_gps" }), [typed]);
    expect(p.kind).toBe("insert");
    if (p.kind !== "insert") return;
    expect(p.replaces).toEqual(["a1"]);
    expect(p.row.verification).toBe("gps");
  });

  it("does not let a too-short run through even if it would replace something", () => {
    expect(plan(input({ distanceM: milesToMeters(0.5) })).kind).toBe("rejected");
  });
});
