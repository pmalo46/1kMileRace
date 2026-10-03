import { beforeEach, describe, expect, it } from "vitest";
import { Db, freshDb } from "./harness";

const MILE = 1609.344;
const RACE_START = "2026-01-01T05:00:00Z";

interface Standing {
  user_id: string;
  total_distance_m: number;
  counted_distance_m: number;
  counted_moving_time_s: number;
  finished_at: Date | null;
  finish_moving_time_s: number | null;
  finish_rank: number | null;
  time_rank: number | null;
  activity_count: number;
}

let db: Db;
let org: string, ann: string, bo: string, fan: string, outsider: string;
let raceId: string, invite: string;

/** Inserts an activity the way the ingest edge function would (bypassing RLS). */
async function logRun(
  user: string,
  startedAt: string,
  miles: number,
  paceMin = 10,
  verification = "gps",
): Promise<string> {
  const moving = Math.round(miles * paceMin * 60);
  const [row] = await db.q<{ id: string }>(
    `insert into activities (user_id, source, type, started_at, ended_at, distance_m, moving_time_s, elapsed_time_s, verification)
     values ($1, 'app_gps', 'run', $2::timestamptz, $2::timestamptz + make_interval(secs => $4), $3, $4, $4, $5::verification_level)
     returning id`,
    [user, startedAt, miles * MILE, moving, verification],
  );
  return row!.id;
}

/** Logs `miles` as a series of 50-mile chunks on consecutive days starting at `firstDay`. */
async function logBulk(user: string, firstDay: string, miles: number, paceMin = 10) {
  let day = new Date(firstDay);
  for (let left = miles; left > 0; left -= 50) {
    await logRun(user, day.toISOString(), Math.min(50, left), paceMin);
    day = new Date(day.getTime() + 86_400_000);
  }
}

const standing = async (user: string) =>
  (await db.q<Standing>(`select * from race_standings where race_id = $1 and user_id = $2`, [raceId, user]))[0];

beforeEach(async () => {
  db = await freshDb();
  [org, ann, bo, fan, outsider] = await Promise.all(
    ["Organizer", "Ann", "Bo", "Fan", "Outsider"].map((n) => db.createUser(n)),
  );
  const [race] = await db.as<{ id: string; invite_code: string }>(
    org,
    `select * from create_race('Neighborhood 1K', 'neighborhood-1k', $1)`,
    [RACE_START],
  );
  raceId = race!.id;
  invite = race!.invite_code;
  await db.as(ann, `select join_race($1)`, [invite]);
  await db.as(bo, `select join_race($1)`, [invite]);
  await db.as(fan, `select join_race($1, true)`, [invite]);
});

describe("races", () => {
  it("creates profiles for new users and a 365-day window", async () => {
    const [p] = await db.q<{ display_name: string }>(`select display_name from profiles where id = $1`, [ann]);
    expect(p!.display_name).toBe("Ann");
    const [r] = await db.q<{ days: number }>(
      `select extract(day from ends_at - starts_at)::int as days from races where id = $1`,
      [raceId],
    );
    expect(r!.days).toBe(365);
  });

  it("makes the creator the organizer", async () => {
    const [m] = await db.q<{ role: string }>(`select role from race_members where race_id = $1 and user_id = $2`, [
      raceId,
      org,
    ]);
    expect(m!.role).toBe("organizer");
  });
});

describe("standings", () => {
  it("totals miles and tracks only activities inside the race window", async () => {
    await logRun(ann, "2026-03-01T12:00:00Z", 5);
    await logRun(ann, "2025-12-31T12:00:00Z", 5); // before the start
    await logRun(ann, "2027-01-02T12:00:00Z", 5); // after the end
    const s = await standing(ann);
    expect(s!.activity_count).toBe(1);
    expect(s!.counted_distance_m).toBeCloseTo(5 * MILE);
    expect(s!.finished_at).toBeNull();
  });

  it("caps counted miles at the goal, prorates the crossing run, and keeps bonus miles", async () => {
    await logBulk(ann, "2026-02-01T12:00:00Z", 990, 10); // 10:00/mi
    await logRun(ann, "2026-06-01T12:00:00Z", 20, 8); // crosses 1000 at 8:00/mi
    const s = await standing(ann);
    expect(s!.counted_distance_m).toBeCloseTo(1000 * MILE);
    expect(s!.total_distance_m).toBeCloseTo(1010 * MILE);
    // 990 mi × 600 s + 10 mi × 480 s
    expect(s!.finish_moving_time_s).toBeCloseTo(990 * 600 + 10 * 480, 0);
    expect(s!.finished_at).not.toBeNull();
    expect(s!.finish_rank).toBe(1);
  });

  it("orders finishers by when the miles were run, not when they were uploaded", async () => {
    await logBulk(bo, "2026-02-01T12:00:00Z", 1000, 9); // Bo finishes on day 20
    await logBulk(ann, "2026-01-05T12:00:00Z", 1000, 11); // Ann uploads later but finished first (day 20 from Jan 5)
    const a = await standing(ann);
    const b = await standing(bo);
    expect(a!.finish_rank).toBe(1);
    expect(b!.finish_rank).toBe(2);
    // Bo was faster overall, so wins on moving time.
    expect(b!.time_rank).toBe(1);
    expect(a!.time_rank).toBe(2);
  });

  it("gives supporters no standing", async () => {
    await logRun(fan, "2026-03-01T12:00:00Z", 5);
    expect(await standing(fan)).toBeUndefined();
  });

  it("removes a standing when a runner leaves", async () => {
    await logRun(ann, "2026-03-01T12:00:00Z", 5);
    await db.as(ann, `select leave_race($1)`, [raceId]);
    expect(await standing(ann)).toBeUndefined();
  });
});

describe("milestones and feed", () => {
  it("records milestones and a finish feed item", async () => {
    await logBulk(ann, "2026-02-01T12:00:00Z", 1000);
    const ms = await db.q<{ miles: number }>(
      `select miles from milestones where race_id = $1 and user_id = $2 order by miles`,
      [raceId, ann],
    );
    expect(ms.map((m) => m.miles)).toEqual([1, 100, 250, 500, 750, 900, 1000]);
    const feed = await db.q<{ type: string }>(
      `select type from feed_items where race_id = $1 and actor_id = $2 and type in ('milestone','finish')`,
      [raceId, ann],
    );
    expect(feed.filter((f) => f.type === "finish")).toHaveLength(1);
    expect(feed.filter((f) => f.type === "milestone")).toHaveLength(6);
  });

  it("creates one feed item per activity and a joined item per member", async () => {
    await logRun(ann, "2026-03-01T12:00:00Z", 3);
    await logRun(ann, "2026-03-02T12:00:00Z", 3);
    const [{ n }] = (await db.q<{ n: number }>(
      `select count(*)::int as n from feed_items where race_id = $1 and type = 'activity'`,
      [raceId],
    )) as [{ n: number }];
    expect(n).toBe(2);
    const [{ j }] = (await db.q<{ j: number }>(
      `select count(*)::int as j from feed_items where race_id = $1 and type = 'joined'`,
      [raceId],
    )) as [{ j: number }];
    expect(j).toBe(4);
  });
});

describe("review", () => {
  it("lets an organizer reject an activity, which unwinds standings, milestones and feed", async () => {
    await logRun(ann, "2026-03-01T12:00:00Z", 99);
    const bad = await logRun(ann, "2026-03-02T12:00:00Z", 5, 3, "pending");
    expect((await standing(ann))!.counted_distance_m).toBeCloseTo(104 * MILE);

    await db.as(org, `select review_activity($1, 'reject', 'Looks like a bike ride')`, [bad]);

    const s = await standing(ann);
    expect(s!.counted_distance_m).toBeCloseTo(99 * MILE);
    const ms = await db.q(`select 1 from milestones where user_id = $1 and miles = 100`, [ann]);
    expect(ms).toHaveLength(0);
    const feed = await db.q(`select 1 from feed_items where activity_id = $1`, [bad]);
    expect(feed).toHaveLength(0);
    const feed100 = await db.q(`select 1 from feed_items where actor_id = $1 and payload ->> 'miles' = '100'`, [ann]);
    expect(feed100).toHaveLength(0);
  });

  it("approves pending treadmill runs to photo verification", async () => {
    const [row] = await db.q<{ id: string }>(
      `insert into activities (user_id, source, type, environment, started_at, ended_at, distance_m, moving_time_s, elapsed_time_s, verification)
       values ($1, 'treadmill_manual', 'run', 'treadmill', '2026-03-01T12:00:00Z', '2026-03-01T12:30:00Z', $2, 1800, 1800, 'pending')
       returning id`,
      [ann, 3 * MILE],
    );
    await db.as(org, `select review_activity($1, 'approve')`, [row!.id]);
    const [a] = await db.q<{ verification: string }>(`select verification from activities where id = $1`, [row!.id]);
    expect(a!.verification).toBe("photo");
  });

  it("does not let participants review", async () => {
    const id = await logRun(ann, "2026-03-01T12:00:00Z", 5);
    await expect(db.as(bo, `select review_activity($1, 'reject')`, [id])).rejects.toThrow(/not a marshal/);
    await expect(db.as(ann, `select review_activity($1, 'reject')`, [id])).rejects.toThrow(/own activity/);
  });
});

describe("row level security", () => {
  it("hides a race's standings and feed from non-members", async () => {
    await logRun(ann, "2026-03-01T12:00:00Z", 5);
    expect(await db.as(outsider, `select * from race_standings`)).toHaveLength(0);
    expect(await db.as(outsider, `select * from feed_items`)).toHaveLength(0);
    expect(await db.as(outsider, `select * from activities`)).toHaveLength(0);
    // Every racing member has a row (zero miles until they log); supporters don't.
    expect(await db.as(bo, `select * from race_standings`)).toHaveLength(3);
    expect(await db.as(bo, `select * from activities`)).toHaveLength(1);
  });

  it("does not let users write activities or standings directly", async () => {
    await expect(
      db.as(
        ann,
        `insert into activities (user_id, source, type, started_at, ended_at, distance_m, moving_time_s, elapsed_time_s, verification)
         values (auth.uid(), 'app_gps', 'run', now() - interval '1 hour', now(), 99999, 60, 60, 'gps')`,
      ),
    ).rejects.toThrow(/row-level security/);
    await db.as(ann, `update race_standings set counted_distance_m = 9999999`);
    expect(await standing(ann)).toBeDefined();
    expect((await standing(ann))!.counted_distance_m).toBe(0);
    await expect(db.as(ann, `select recompute_standing($1, $2)`, [raceId, ann])).rejects.toThrow(/permission denied/);
  });

  it("exposes only the app RPCs, and only to signed-in users", async () => {
    await db.pg.exec("set role anon");
    try {
      await expect(db.pg.query(`select join_race('whatever')`)).rejects.toThrow(/permission denied/);
    } finally {
      await db.pg.exec("reset role");
    }
    await expect(db.as(ann, `select feed_on_join()`)).rejects.toThrow(/permission denied/);
    await expect(db.as(ann, `select shares_race($1, $2)`, [bo, org])).rejects.toThrow(/does not exist/);
    expect(await db.as(ann, `select * from race_members`)).toHaveLength(4);
  });

  it("does not let members promote themselves", async () => {
    await db.as(ann, `update race_members set role = 'organizer' where user_id = auth.uid()`);
    const [m] = await db.q<{ role: string }>(`select role from race_members where race_id = $1 and user_id = $2`, [
      raceId,
      ann,
    ]);
    expect(m!.role).toBe("participant");
  });

  it("lets members cheer and comment only on their own race's feed", async () => {
    await logRun(ann, "2026-03-01T12:00:00Z", 5);
    const [item] = await db.q<{ id: string }>(`select id from feed_items where type = 'activity'`);
    await db.as(bo, `insert into cheers (feed_item_id, user_id) values ($1, auth.uid())`, [item!.id]);
    await db.as(bo, `insert into comments (feed_item_id, user_id, body) values ($1, auth.uid(), 'Go Ann!')`, [item!.id]);
    await expect(
      db.as(outsider, `insert into cheers (feed_item_id, user_id) values ($1, auth.uid())`, [item!.id]),
    ).rejects.toThrow(/row-level security/);
    expect(await db.as(ann, `select * from comments`)).toHaveLength(1);
  });
});

describe("logging runs", () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    source: "treadmill_manual",
    type: "run",
    environment: "treadmill",
    started_at: "2026-03-01T12:00:00Z",
    ended_at: "2026-03-01T12:30:00Z",
    distance_m: 3 * MILE,
    moving_time_s: 1800,
    elapsed_time_s: 1800,
    verification: "pending",
    flags: [],
    ...overrides,
  });
  const ingest = (user: string, activity: object, evidence: string | null = null, replaces: string[] = []) =>
    db.q<{ ingest_activity: { id: string } }>(`select to_jsonb(ingest_activity($1, $2, $3, $4)) as ingest_activity`, [
      user,
      JSON.stringify(activity),
      replaces,
      evidence,
    ]);

  it("writes the activity and its evidence, and counts it toward standings", async () => {
    const [res] = await ingest(ann, row(), `${ann}/console.jpg`);
    const id = res!.ingest_activity.id;
    const [ev] = await db.q<{ storage_path: string }>(`select storage_path from activity_evidence where activity_id = $1`, [id]);
    expect(ev!.storage_path).toBe(`${ann}/console.jpg`);
    expect((await standing(ann))!.counted_distance_m).toBeCloseTo(3 * MILE);
  });

  it("accepts hand-entered outdoor runs", async () => {
    await ingest(ann, row({ source: "manual", environment: "outdoor" }));
    expect((await standing(ann))!.activity_count).toBe(1);
  });

  it("replaces lower-quality copies in the same transaction", async () => {
    const [first] = await ingest(ann, row({ source: "manual", environment: "outdoor" }));
    await ingest(ann, row({ source: "app_gps", environment: "outdoor", verification: "gps" }), null, [
      first!.ingest_activity.id,
    ]);
    const s = await standing(ann);
    expect(s!.activity_count).toBe(1);
    expect(s!.counted_distance_m).toBeCloseTo(3 * MILE);
  });

  it("refuses evidence from someone else's folder", async () => {
    await expect(ingest(ann, row(), `${bo}/console.jpg`)).rejects.toThrow(/own folder/);
    expect(await db.q(`select * from activities`)).toHaveLength(0);
  });

  it("is not callable by signed-in users", async () => {
    await expect(
      db.as(ann, `select ingest_activity(auth.uid(), $1::jsonb)`, [JSON.stringify(row())]),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("evidence storage", () => {
  const upload = (user: string, name: string) =>
    db.as(user, `insert into storage.objects (bucket_id, name) values ('evidence', $1)`, [name]);
  const visible = (user: string) => db.as<{ name: string }>(user, `select name from storage.objects`);

  it("lets runners upload only into their own folder", async () => {
    await upload(ann, `${ann}/console.jpg`);
    await expect(upload(ann, `${bo}/console.jpg`)).rejects.toThrow(/row-level security/);
  });

  it("shows photos to their owner and the race's organizers, not other runners", async () => {
    await upload(ann, `${ann}/console.jpg`);
    expect(await visible(ann)).toHaveLength(1);
    expect(await visible(org)).toHaveLength(1);
    expect(await visible(bo)).toHaveLength(0);
    expect(await visible(outsider)).toHaveLength(0);
  });
});
