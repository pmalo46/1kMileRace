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

  it("stops the finish clock at the line, not at the end of the crossing run", async () => {
    await logBulk(ann, "2026-02-01T12:00:00Z", 990);
    await logBulk(bo, "2026-02-01T12:00:00Z", 990);
    // Ann crosses 1,000 halfway through a 20-mile run (12:00 to 14:40), so at 13:20.
    await logRun(ann, "2026-06-01T12:00:00Z", 20, 8);
    // Bo starts later and crosses at the end of a 10-mile run, at 13:30, before Ann stops.
    await logRun(bo, "2026-06-01T12:10:00Z", 10, 8);
    const a = await standing(ann);
    const b = await standing(bo);
    expect(a!.finished_at!.toISOString()).toBe("2026-06-01T13:20:00.000Z");
    expect(b!.finished_at!.toISOString()).toBe("2026-06-01T13:30:00.000Z");
    expect(a!.finish_rank).toBe(1);
    expect(b!.finish_rank).toBe(2);
    const [m] = await db.q<{ reached_at: Date }>(
      `select reached_at from milestones where race_id = $1 and user_id = $2 and miles = 1000`,
      [raceId, ann],
    );
    expect(m!.reached_at.toISOString()).toBe("2026-06-01T13:20:00.000Z");
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
    expect(ms.map((m) => m.miles)).toEqual([
      1, 50, 100, 200, 250, 300, 400, 500, 600, 700, 750, 800, 900, 950, 975, 990, 995, 1000,
    ]);
    const feed = await db.q<{ type: string }>(
      `select type from feed_items where race_id = $1 and actor_id = $2 and type in ('milestone','finish')`,
      [raceId, ann],
    );
    expect(feed.filter((f) => f.type === "finish")).toHaveLength(1);
    expect(feed.filter((f) => f.type === "milestone")).toHaveLength(17);
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

    await db.as(org, `select review_activity($1, $2, 'reject', 'Looks like a bike ride')`, [raceId, bad]);

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
    await db.as(org, `select review_activity($1, $2, 'approve')`, [raceId, row!.id]);
    const [a] = await db.q<{ verification: string }>(`select verification from activities where id = $1`, [row!.id]);
    expect(a!.verification).toBe("photo");
  });

  it("does not let participants review, nor anyone review their own run or one already reviewed", async () => {
    const id = await logRun(ann, "2026-03-01T12:00:00Z", 5, 10, "pending");
    await expect(db.as(bo, `select review_activity($1, $2, 'reject')`, [raceId, id])).rejects.toThrow(/not allowed/);
    const mine = await logRun(org, "2026-03-01T12:00:00Z", 5, 10, "pending");
    await expect(db.as(org, `select review_activity($1, $2, 'approve')`, [raceId, mine])).rejects.toThrow(/own activity/);
    const done = await logRun(bo, "2026-03-01T12:00:00Z", 5);
    await expect(db.as(org, `select review_activity($1, $2, 'approve')`, [raceId, done])).rejects.toThrow(/already reviewed/);
  });

  it("lists waiting runs for organizers and marshals only, with the runner's usual pace", async () => {
    await logRun(ann, "2026-03-01T12:00:00Z", 3, 10);
    const fast = await logRun(ann, "2026-03-02T12:00:00Z", 3, 3, "pending");
    await expect(db.as(bo, `select * from pending_reviews($1)`, [raceId])).rejects.toThrow(/not allowed/);
    const rows = await db.as<{ activity_id: string; display_name: string; usual_pace_s: number }>(
      org,
      `select * from pending_reviews($1)`,
      [raceId],
    );
    expect(rows.map((r) => [r.activity_id, r.display_name])).toEqual([[fast, "Ann"]]);
    expect(rows[0]!.usual_pace_s).toBeCloseTo(600);

    await db.as(org, `select set_member_role($1, $2, 'marshal')`, [raceId, bo]);
    expect(await db.as(bo, `select * from pending_reviews($1)`, [raceId])).toHaveLength(1);
  });

  it("approves plain hand-entered runs in one go, leaving anything else unusual for a person", async () => {
    const plain = await logRun(ann, "2026-03-01T12:00:00Z", 3, 10, "pending");
    const odd = await logRun(bo, "2026-03-02T12:00:00Z", 3, 3, "pending");
    await db.q(`update activities set source = 'manual', flags = '[{"code":"manual_entry","severity":"flag","message":"Entered by hand."}]' where id = $1`, [plain]);
    await db.q(
      `update activities set source = 'manual', flags = '[{"code":"manual_entry","severity":"flag","message":"x"},{"code":"pace_too_fast","severity":"flag","message":"y"}]' where id = $1`,
      [odd],
    );
    const [res] = await db.as<{ approve_hand_entered: number }>(org, `select approve_hand_entered($1)`, [raceId]);
    expect(res!.approve_hand_entered).toBe(1);
    const verif = await db.q<{ id: string; verification: string }>(`select id, verification from activities where id in ($1, $2)`, [plain, odd]);
    expect(Object.fromEntries(verif.map((v) => [v.id, v.verification]))).toEqual({ [plain]: "device", [odd]: "pending" });
    expect(await db.q(`select 1 from activity_reviews where activity_id = $1 and decision = 'approve'`, [plain])).toHaveLength(1);
  });
});

describe("race admin", () => {
  const role = async (user: string) =>
    (await db.q<{ role: string; status: string }>(`select role, status from race_members where race_id = $1 and user_id = $2`, [raceId, user]))[0];

  it("lets organizers make marshals and remove runners, but never touch organizers or themselves", async () => {
    await db.as(org, `select set_member_role($1, $2, 'marshal')`, [raceId, ann]);
    expect((await role(ann))!.role).toBe("marshal");
    await db.as(org, `select set_member_role($1, $2, 'participant')`, [raceId, ann]);
    expect((await role(ann))!.role).toBe("participant");
    await expect(db.as(org, `select set_member_role($1, $2, 'organizer')`, [raceId, ann])).rejects.toThrow(/participant or marshal/);
    await expect(db.as(org, `select set_member_role($1, $2, 'marshal')`, [raceId, org])).rejects.toThrow(/own role/);

    await db.as(org, `select remove_member($1, $2)`, [raceId, bo]);
    expect((await role(bo))!.status).toBe("removed");
    await expect(db.as(bo, `select join_race($1)`, [invite])).resolves.toBeDefined();
    expect((await role(bo))!.status).toBe("removed");
  });

  it("keeps runners and marshals out of organizer tools", async () => {
    await db.as(org, `select set_member_role($1, $2, 'marshal')`, [raceId, ann]);
    for (const sql of [
      `select set_member_role($1, '${bo}', 'marshal')`,
      `select remove_member($1, '${bo}')`,
      `select replace_invite_code($1)`,
      `select update_race_details($1, 'Mine now')`,
      `select post_announcement($1, 'Hi')`,
    ]) {
      await expect(db.as(ann, sql, [raceId])).rejects.toThrow(/not allowed/);
    }
    // The old direct-edit routes are closed.
    await db.as(org, `update races set invite_code = 'aaaabbbb' where id = $1`, [raceId]);
    await db.as(org, `update race_members set role = 'participant' where race_id = $1 and user_id = $2`, [raceId, ann]);
    expect((await db.q<{ invite_code: string }>(`select invite_code from races where id = $1`, [raceId]))[0]!.invite_code).toBe(invite);
    expect((await role(ann))!.role).toBe("marshal");
  });

  it("renames the race and replaces the invite code, and the old code stops working", async () => {
    await db.as(org, `select update_race_details($1, '  Neighborhood 1K 2027 ', '')`, [raceId]);
    const [code] = await db.as<{ replace_invite_code: string }>(org, `select replace_invite_code($1)`, [raceId]);
    const [r] = await db.q<{ name: string; description: string | null; invite_code: string }>(
      `select name, description, invite_code from races where id = $1`,
      [raceId],
    );
    expect(r).toEqual({ name: "Neighborhood 1K 2027", description: null, invite_code: code!.replace_invite_code });
    expect(r!.invite_code).not.toBe(invite);
    await expect(db.as(outsider, `select join_race($1)`, [invite])).rejects.toThrow(/invalid invite code/);
  });
});

describe("chat", () => {
  it("lets members talk in their own race only, and organizers announce", async () => {
    await db.as(ann, `insert into messages (race_id, user_id, body) values ($1, auth.uid(), 'Long run Saturday?')`, [raceId]);
    await expect(
      db.as(outsider, `insert into messages (race_id, user_id, body) values ($1, auth.uid(), 'hi')`, [raceId]),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.as(ann, `insert into messages (race_id, user_id, kind, body) values ($1, auth.uid(), 'announcement', 'Me!')`, [raceId]),
    ).rejects.toThrow(/row-level security/);
    await db.as(org, `select post_announcement($1, 'Group run 8am at the park')`, [raceId]);

    expect(await db.as(outsider, `select * from messages`)).toHaveLength(0);
    const seen = await db.as<{ kind: string; body: string }>(bo, `select kind, body from messages order by created_at`);
    expect(seen).toEqual([
      { kind: "chat", body: "Long run Saturday?" },
      { kind: "announcement", body: "Group run 8am at the park" },
    ]);
  });

  it("lets people delete their own messages, and organizers delete anyone's", async () => {
    await db.as(ann, `insert into messages (race_id, user_id, body) values ($1, auth.uid(), 'one')`, [raceId]);
    await db.as(ann, `insert into messages (race_id, user_id, body) values ($1, auth.uid(), 'two')`, [raceId]);
    await db.as(bo, `delete from messages where body = 'one'`);
    expect(await db.q(`select 1 from messages`)).toHaveLength(2);
    await db.as(org, `delete from messages where body = 'one'`);
    await db.as(ann, `delete from messages where body = 'two'`);
    expect(await db.q(`select 1 from messages`)).toHaveLength(0);
  });

  it("refuses empty messages", async () => {
    await expect(db.as(ann, `insert into messages (race_id, user_id, body) values ($1, auth.uid(), '   ')`, [raceId])).rejects.toThrow(
      /messages_not_empty/,
    );
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

  it("takes a GIPHY GIF in a comment, with or without words, and nothing else", async () => {
    await logRun(ann, "2026-03-01T12:00:00Z", 5);
    const [item] = await db.q<{ id: string }>(`select id from feed_items where type = 'activity'`);
    const comment = (body: string, url: string | null) =>
      db.as(
        bo,
        `insert into comments (feed_item_id, user_id, body, gif_id, gif_url, gif_width, gif_height)
         values ($1, auth.uid(), $2, case when $3::text is null then null else 'abc123' end, $3,
                 case when $3::text is null then null else 200 end, case when $3::text is null then null else 150 end)`,
        [item!.id, body, url],
      );
    await comment("", "https://media2.giphy.com/media/abc123/200w.webp");
    await comment("Go Ann!", "https://media.giphy.com/media/abc123/200w.gif");
    await expect(comment("", null)).rejects.toThrow(/comments_not_empty/);
    await expect(comment("", "https://example.com/abc123.gif")).rejects.toThrow(/gif_url_check/);
    await expect(
      db.as(bo, `insert into comments (feed_item_id, user_id, body, gif_id) values ($1, auth.uid(), 'Hi', 'abc123')`, [
        item!.id,
      ]),
    ).rejects.toThrow(/comments_gif_complete/);
    expect(await db.as(ann, `select * from comments`)).toHaveLength(2);
  });
});

describe("invite preview", () => {
  const asAnon = async <T,>(sql: string, params: unknown[] = []) => {
    await db.pg.exec("set role anon");
    try {
      return (await db.pg.query<T>(sql, params)).rows;
    } finally {
      await db.pg.exec("reset role");
    }
  };

  it("shows a signed-out caller the race name, organizer, runner count and start, and nothing else", async () => {
    const rows = await asAnon<Record<string, unknown>>(`select * from invite_preview($1)`, [` ${invite.toUpperCase()} `]);
    expect(rows).toEqual([
      { name: "Neighborhood 1K", organizer_name: "Organizer", member_count: 3, starts_at: new Date(RACE_START) },
    ]);
  });

  it("hands out eight-letter codes that can't be read as a phone number, and accepts them typed as ABCD-EFGH", async () => {
    expect(invite).toMatch(/^[a-hj-km-np-z]{8}$/);
    const typed = `${invite.slice(0, 4).toUpperCase()}-${invite.slice(4).toUpperCase()}`;
    await db.as(outsider, `select join_race($1)`, [typed]);
    expect(await db.as(outsider, `select * from race_members where user_id = auth.uid()`)).toHaveLength(1);
  });

  it("returns nothing for a code that doesn't match a race", async () => {
    expect(await asAnon(`select * from invite_preview('nope')`)).toEqual([]);
    expect(await db.as(outsider, `select * from invite_preview('nope')`)).toEqual([]);
  });
});

describe("push tokens", () => {
  const tokens = () => db.q<{ token: string; user_id: string }>(`select token, user_id from push_tokens order by token`);

  it("saves a device's token and hands it over when someone else signs in on that device", async () => {
    await db.as(ann, `select register_push_token('ExponentPushToken[phone]', 'android')`);
    await db.as(ann, `select register_push_token('ExponentPushToken[phone]', 'android')`);
    expect(await tokens()).toEqual([{ token: "ExponentPushToken[phone]", user_id: ann }]);
    await db.as(bo, `select register_push_token('ExponentPushToken[phone]', 'android')`);
    expect(await tokens()).toEqual([{ token: "ExponentPushToken[phone]", user_id: bo }]);
  });

  it("keeps tokens private to their owner and away from signed-out callers", async () => {
    await db.as(ann, `select register_push_token('ExponentPushToken[ann]', 'ios')`);
    expect(await db.as(bo, `select * from push_tokens`)).toHaveLength(0);
    expect(await db.as(ann, `select * from push_tokens`)).toHaveLength(1);
    await db.pg.exec("set role anon");
    try {
      await expect(db.pg.query(`select register_push_token('x', 'ios')`)).rejects.toThrow(/permission denied/);
    } finally {
      await db.pg.exec("reset role");
    }
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

  it("keeps whether a run was timed, and counts untimed miles in full", async () => {
    await ingest(ann, row({ source: "manual", environment: "outdoor", time_recorded: false, moving_time_s: 5400, elapsed_time_s: 5400 }));
    await ingest(bo, row({ source: "manual", environment: "outdoor" }));
    const rows = await db.q<{ user_id: string; time_recorded: boolean }>(`select user_id, time_recorded from activities`);
    expect(rows.find((r) => r.user_id === ann)!.time_recorded).toBe(false);
    expect(rows.find((r) => r.user_id === bo)!.time_recorded).toBe(true);
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

  it("shows photos to everyone in the runner's race, and no one outside it", async () => {
    await upload(ann, `${ann}/console.jpg`);
    expect(await visible(ann)).toHaveLength(1);
    expect(await visible(org)).toHaveLength(1);
    expect(await visible(bo)).toHaveLength(1);
    expect(await visible(outsider)).toHaveLength(0);
  });
});
