// Logs a run or walk for the signed-in user. The shared rules engine (@1k/core) decides
// whether it counts; the database triggers then update standings, milestones and the feed.
//
// POST { activity: ActivityInput, evidencePath?: "<user id>/<file>" }
//   200 { activity, evaluation, countedIn: [{ race, countedMiles }] }
//   401 not signed in · 400 malformed · 409 duplicate · 422 breaks the rules

import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_RACE_RULES,
  IngestRequest,
  metersToMiles,
  milestonePush,
  overtakePush,
  overtakes,
  ownMilestonePush,
  planIngest,
  type StandingLike,
} from "@1k/core";
import { sendPush } from "../_shared/push.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** The runner's milestone and finish feed items, to spot the ones a new run adds. */
const milestoneItems = (userId: string) =>
  admin
    .from("feed_items")
    .select("id, race_id, type, payload, race:races(name)")
    .eq("actor_id", userId)
    .in("type", ["milestone", "finish"]);

/** Runs older than this were run well before anyone could be "just" passed, so they move people quietly. */
const OVERTAKE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

type BoardRow = StandingLike & { race_id: string };

/** Everyone's standings in each race this runner is in, to see who a new run moves them past. */
async function boardsFor(userId: string): Promise<BoardRow[]> {
  const { data: mine } = await admin.from("race_standings").select("race_id").eq("user_id", userId);
  const raceIds = (mine ?? []).map((r) => r.race_id as string);
  if (raceIds.length === 0) return [];
  const { data } = await admin
    .from("race_standings")
    .select("race_id, user_id, counted_distance_m, counted_moving_time_s, finished_at, finish_moving_time_s")
    .in("race_id", raceIds);
  return (data ?? []) as BoardRow[];
}

const inRace = (rows: BoardRow[], raceId: string) => rows.filter((r) => r.race_id === raceId);

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

  // A run that carries the runner across a finish line counts whatever its length.
  const { data: standings, error: standingsError } = await admin
    .from("race_standings")
    .select("counted_distance_m, race:races(goal_m, starts_at, ends_at)")
    .eq("user_id", user.id)
    .is("finished_at", null);
  if (standingsError) return json(500, { error: standingsError.message });
  const startedAt = activity.startedAt.getTime();
  const remaining = (standings ?? []).flatMap((s) => {
    const race = s.race as unknown as { goal_m: number; starts_at: string; ends_at: string } | null;
    const inWindow = race && startedAt >= Date.parse(race.starts_at) && startedAt < Date.parse(race.ends_at);
    return inWindow ? [race.goal_m - s.counted_distance_m] : [];
  });
  const toFinishM = remaining.length > 0 ? Math.min(...remaining) : undefined;

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
    new Date(),
    { toFinishM },
  );

  if (plan.kind === "rejected") {
    const reasons = plan.evaluation.issues.filter((i) => i.severity === "reject");
    return json(422, { error: reasons[0]?.message ?? "This activity doesn't count.", issues: reasons });
  }
  if (plan.kind === "duplicate") {
    return json(409, { error: "You already have an activity logged at that time." });
  }

  const { data: before } = await milestoneItems(user.id);
  const fresh = Date.now() - activity.endedAt.getTime() < OVERTAKE_WINDOW_MS;
  const boardsBefore = fresh ? await boardsFor(user.id) : [];

  const { data: saved, error } = await admin.rpc("ingest_activity", {
    p_user: user.id,
    p_activity: plan.row,
    p_replaces: plan.replaces,
    p_evidence_path: evidencePath ?? null,
    p_evidence_taken_at: activity.evidenceTakenAt?.toISOString() ?? null,
  });
  if (error) return json(500, { error: error.message });

  // Tell the runner, and the rest of each race, about any milestone or finish this run brought.
  const known = new Set((before ?? []).map((m) => m.id));
  const reached = ((await milestoneItems(user.id)).data ?? []).filter((m) => !known.has(m.id));
  const { data: profile } = await admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const runner = profile?.display_name ?? "A runner";
  if (reached.length > 0) {
    for (const m of reached) {
      const kind = m.type as "milestone" | "finish";
      const miles = (m.payload as { miles?: number } | null)?.miles ?? 0;
      const race = (m.race as unknown as { name: string } | null)?.name ?? "the race";
      await sendPush(admin, [user.id], ownMilestonePush(kind, miles, race));
      const { data: members } = await admin
        .from("race_members")
        .select("user_id")
        .match({ race_id: m.race_id, status: "active" })
        .neq("user_id", user.id);
      await sendPush(
        admin,
        (members ?? []).map((r) => r.user_id as string),
        milestonePush(runner, kind, miles, race),
      );
    }
  }

  const { data: counted } = await admin
    .from("race_activities")
    .select("race_id, counted_distance_m, race:races(name)")
    .eq("activity_id", saved.id);

  // Let anyone this run carried the runner past know, so they can cheer it (and lace up).
  if (fresh && boardsBefore.length > 0) {
    const boardsAfter = await boardsFor(user.id);
    for (const c of counted ?? []) {
      const after = inRace(boardsAfter, c.race_id);
      const { youPassed } = overtakes(inRace(boardsBefore, c.race_id), after, user.id);
      if (youPassed.length === 0) continue;
      const me = after.find((s) => s.user_id === user.id)!;
      const race = (c.race as unknown as { name: string } | null)?.name ?? "the race";
      const { data: item } = await admin
        .from("feed_items")
        .select("id")
        .match({ race_id: c.race_id, activity_id: saved.id, type: "activity" })
        .maybeSingle();
      for (const passed of youPassed) {
        await sendPush(
          admin,
          [passed.user_id],
          overtakePush(
            runner,
            { type: activity.type, distanceM: c.counted_distance_m },
            me.counted_distance_m - passed.counted_distance_m,
            race,
            item?.id ?? null,
          ),
        );
      }
    }
  }

  return json(200, {
    activity: saved,
    evaluation: plan.evaluation,
    countedIn: (counted ?? []).map((c) => ({
      race: (c.race as unknown as { name: string } | null)?.name ?? "",
      countedMiles: metersToMiles(c.counted_distance_m),
    })),
  });
});
