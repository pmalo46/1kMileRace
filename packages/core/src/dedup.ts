import type { ActivitySource } from "./types.ts";

export interface TimedActivity {
  id?: string;
  source: ActivitySource;
  startedAt: Date;
  endedAt: Date;
  polyline?: string | null;
}

/** Overlap duration divided by the shorter activity's duration (0..1). */
export function overlapRatio(a: TimedActivity, b: TimedActivity): number {
  const start = Math.max(a.startedAt.getTime(), b.startedAt.getTime());
  const end = Math.min(a.endedAt.getTime(), b.endedAt.getTime());
  const overlap = end - start;
  if (overlap <= 0) return 0;
  const shorter = Math.min(
    a.endedAt.getTime() - a.startedAt.getTime(),
    b.endedAt.getTime() - b.startedAt.getTime(),
  );
  return shorter > 0 ? overlap / shorter : 0;
}

export const DUPLICATE_OVERLAP = 0.5;

/** Higher is more trustworthy. */
export function sourceRank(a: TimedActivity): number {
  if (a.source === "app_gps") return 4;
  if ((a.source === "healthkit" || a.source === "health_connect" || a.source === "polar") && a.polyline) return 3;
  if (a.source === "file") return 2;
  if (a.source === "healthkit" || a.source === "health_connect" || a.source === "polar") return 1;
  return 0; // typed in by hand: treadmill or manual
}

export type DedupDecision =
  | { action: "insert" }
  | { action: "skip"; duplicateOf: TimedActivity }
  | { action: "replace"; replaces: TimedActivity[] };

/**
 * Decides what to do with an incoming activity given the user's existing ones,
 * e.g. a watch run arriving via Apple Health after the same run was recorded in-app.
 */
export function resolveDuplicates(incoming: TimedActivity, existing: TimedActivity[]): DedupDecision {
  const dupes = existing.filter((e) => overlapRatio(incoming, e) > DUPLICATE_OVERLAP);
  if (dupes.length === 0) return { action: "insert" };
  const best = dupes.reduce((x, y) => (sourceRank(y) > sourceRank(x) ? y : x));
  if (sourceRank(incoming) > sourceRank(best)) return { action: "replace", replaces: dupes };
  return { action: "skip", duplicateOf: best };
}
