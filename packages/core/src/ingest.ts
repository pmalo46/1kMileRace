import { z } from "zod";
import { resolveDuplicates, type TimedActivity } from "./dedup.ts";
import { evaluateActivity, type Evaluation } from "./rules.ts";
import { ActivityInput, type RaceRules, type Verification } from "./types.ts";

/** Body of a POST to the ingest-activity edge function. */
export const IngestRequest = z
  .object({
    activity: ActivityInput,
    /** Storage path of the evidence photo in the `evidence` bucket: `<user id>/<file>`. */
    evidencePath: z.string().min(1).max(300).optional(),
  })
  .strict();
export type IngestRequest = z.infer<typeof IngestRequest>;

/** An `activities` row as the ingest_activity SQL function expects it (user_id is added server-side). */
export interface ActivityRow {
  source: ActivityInput["source"];
  source_external_id: string | null;
  type: ActivityInput["type"];
  environment: ActivityInput["environment"];
  started_at: string;
  ended_at: string;
  distance_m: number;
  moving_time_s: number;
  elapsed_time_s: number;
  elevation_gain_m: number | null;
  avg_heart_rate: number | null;
  device_name: string | null;
  polyline: string | null;
  verification: Verification;
  flags: Evaluation["issues"];
}

export type IngestPlan =
  | { kind: "rejected"; evaluation: Evaluation }
  | { kind: "duplicate"; duplicateOf: TimedActivity }
  | { kind: "insert"; evaluation: Evaluation; row: ActivityRow; replaces: string[] };

/**
 * Decides what the server does with an incoming activity: reject it, skip it as a
 * duplicate of one the user already has, or insert it (replacing lower-quality copies).
 * `existing` is the user's non-rejected activities that overlap it in time.
 */
export function planIngest(
  a: ActivityInput,
  existing: TimedActivity[],
  rules: RaceRules,
  now: Date = new Date(),
): IngestPlan {
  const evaluation = evaluateActivity(a, rules, now);
  if (evaluation.status === "rejected") return { kind: "rejected", evaluation };

  const dedup = resolveDuplicates(a, existing);
  if (dedup.action === "skip") return { kind: "duplicate", duplicateOf: dedup.duplicateOf };
  const replaces = dedup.action === "replace" ? dedup.replaces.flatMap((r) => (r.id ? [r.id] : [])) : [];

  return {
    kind: "insert",
    evaluation,
    replaces,
    row: {
      source: a.source,
      source_external_id: a.sourceExternalId ?? null,
      type: a.type,
      environment: a.environment,
      started_at: a.startedAt.toISOString(),
      ended_at: a.endedAt.toISOString(),
      distance_m: a.distanceM,
      moving_time_s: a.movingTimeS,
      elapsed_time_s: a.elapsedTimeS,
      elevation_gain_m: a.elevationGainM ?? null,
      avg_heart_rate: a.avgHeartRate ?? null,
      device_name: a.deviceName ?? null,
      polyline: a.polyline ?? null,
      verification: evaluation.verification,
      flags: evaluation.issues,
    },
  };
}
