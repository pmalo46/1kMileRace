// Logs a run or walk for the signed-in user. The shared rules engine (@1k/core) decides
// whether it counts; the database triggers then update standings, milestones and the feed.
//
// POST { activity: ActivityInput, evidencePath?: "<user id>/<file>" }
//   200 { activity, evaluation, countedIn: [{ race, countedMiles }] }
//   401 not signed in · 400 malformed · 409 duplicate · 422 breaks the rules

import { createClient } from "@supabase/supabase-js";
import { DEFAULT_RACE_RULES, IngestRequest, metersToMiles, planIngest } from "@1k/core";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  const user = auth.user;
  if (!user) return json(401, { error: "Please sign in again." });

  const parsed = IngestRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return json(400, { error: "That activity is missing something.", details: parsed.error.issues });
  }
  const { activity, evidencePath } = parsed.data;

  // Evidence must be a photo this user actually uploaded; the client's count isn't trusted.
  if (evidencePath) {
    const slash = evidencePath.lastIndexOf("/");
    const folder = evidencePath.slice(0, slash);
    const file = evidencePath.slice(slash + 1);
    const { data: found } = await admin.storage.from("evidence").list(folder, { search: file });
    if (folder !== user.id || !found?.some((o) => o.name === file)) {
      return json(400, { error: "We couldn't find that photo. Try attaching it again." });
    }
  }
  activity.evidenceCount = evidencePath ? 1 : 0;

  const { data: overlapping, error: overlapError } = await admin
    .from("activities")
    .select("id, source, started_at, ended_at, polyline")
    .eq("user_id", user.id)
    .neq("verification", "rejected")
    .lt("started_at", activity.endedAt.toISOString())
    .gt("ended_at", activity.startedAt.toISOString());
  if (overlapError) return json(500, { error: overlapError.message });

  // Per-race rule overrides (races.rules) aren't applied yet; every race uses the defaults.
  const plan = planIngest(
    activity,
    overlapping.map((o) => ({
      id: o.id,
      source: o.source,
      startedAt: new Date(o.started_at),
      endedAt: new Date(o.ended_at),
      polyline: o.polyline,
    })),
    DEFAULT_RACE_RULES,
  );

  if (plan.kind === "rejected") {
    const reasons = plan.evaluation.issues.filter((i) => i.severity === "reject");
    return json(422, { error: reasons[0]?.message ?? "This activity doesn't count.", issues: reasons });
  }
  if (plan.kind === "duplicate") {
    return json(409, { error: "You already have an activity logged at that time." });
  }

  const { data: saved, error } = await admin.rpc("ingest_activity", {
    p_user: user.id,
    p_activity: plan.row,
    p_replaces: plan.replaces,
    p_evidence_path: evidencePath ?? null,
    p_evidence_taken_at: activity.evidenceTakenAt?.toISOString() ?? null,
  });
  if (error) return json(500, { error: error.message });

  const { data: counted } = await admin
    .from("race_activities")
    .select("counted_distance_m, race:races(name)")
    .eq("activity_id", saved.id);

  return json(200, {
    activity: saved,
    evaluation: plan.evaluation,
    countedIn: (counted ?? []).map((c) => ({
      race: (c.race as unknown as { name: string } | null)?.name ?? "",
      countedMiles: metersToMiles(c.counted_distance_m),
    })),
  });
});
