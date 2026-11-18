// Tells people about a cheer or comment the signed-in user just made. The app calls this
// right after saving one; the function re-reads it from the database, so a caller can only
// trigger a notification for something they really did, moments ago.
//
// POST { kind: "cheer", feedItemId, emoji } | { kind: "comment", commentId }
//    | { kind: "review", activityId } | { kind: "message", messageId }
//   200 { notified } · 401 not signed in · 400 malformed · 404 nothing recent of the caller's to announce
//
// review: the caller's own decision on a run tells its runner. message: an announcement goes
// to the whole race; a chat message only to the people it @mentions.

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  announcementPush,
  cheerPush,
  commentPush,
  mentionPush,
  mentionedIds,
  reviewedPush,
  type FeedItemSummary,
} from "@1k/core";
import { sendPush } from "../_shared/push.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const Body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cheer"), feedItemId: z.uuid(), emoji: z.string().min(1).max(16) }).strict(),
  z.object({ kind: z.literal("comment"), commentId: z.uuid() }).strict(),
  z.object({ kind: z.literal("review"), activityId: z.uuid() }).strict(),
  z.object({ kind: z.literal("message"), messageId: z.uuid() }).strict(),
]);

/** Everyone active in a race except one person, with their names for matching @mentions. */
async function racemates(raceId: string, except: string) {
  const { data } = await admin
    .from("race_members")
    .select("user_id, profile:profiles(display_name)")
    .match({ race_id: raceId, status: "active" })
    .neq("user_id", except);
  return (data ?? []).map((m) => ({
    id: m.user_id as string,
    name: (m.profile as unknown as { display_name: string } | null)?.display_name ?? "",
  }));
}

/** Older cheers and comments can't be re-announced. */
const FRESH_MS = 5 * 60 * 1000;
const isFresh = (createdAt: string) => Date.now() - Date.parse(createdAt) < FRESH_MS;

async function feedItem(id: string): Promise<(FeedItemSummary & { actorId: string }) | null> {
  const { data } = await admin
    .from("feed_items")
    .select("id, type, actor_id, payload, activity:activities(type, distance_m)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const activity = data.activity as unknown as { type: "run" | "walk"; distance_m: number } | null;
  return {
    id: data.id,
    type: data.type,
    actorId: data.actor_id,
    miles: (data.payload as { miles?: number } | null)?.miles ?? null,
    activity: activity ? { type: activity.type, distanceM: activity.distance_m } : null,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  const user = auth.user;
  if (!user) return json(401, { error: "Please sign in again." });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, { error: "Malformed request.", details: parsed.error.issues });
  const body = parsed.data;

  const { data: profile } = await admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const name = profile?.display_name ?? "Someone";

  if (body.kind === "cheer") {
    const { data: cheer } = await admin
      .from("cheers")
      .select("created_at")
      .match({ feed_item_id: body.feedItemId, user_id: user.id, emoji: body.emoji })
      .maybeSingle();
    const item = cheer && isFresh(cheer.created_at) ? await feedItem(body.feedItemId) : null;
    if (!item) return json(404, { error: "No recent cheer to announce." });
    if (item.actorId === user.id) return json(200, { notified: 0 });
    await sendPush(admin, [item.actorId], cheerPush(name, body.emoji, item));
    return json(200, { notified: 1 });
  }

  if (body.kind === "review") {
    const { data: review } = await admin
      .from("activity_reviews")
      .select("decision, note, created_at, activity:activities(user_id, type, distance_m)")
      .match({ activity_id: body.activityId, reviewer_id: user.id })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const activity = review?.activity as unknown as { user_id: string; type: "run" | "walk"; distance_m: number } | null;
    if (!review || !activity || !isFresh(review.created_at)) return json(404, { error: "No recent review to announce." });
    await sendPush(
      admin,
      [activity.user_id],
      reviewedPush(review.decision as "approve" | "reject", activity.type, activity.distance_m, review.note),
    );
    return json(200, { notified: 1 });
  }

  if (body.kind === "message") {
    const { data: message } = await admin
      .from("messages")
      .select("race_id, kind, body, created_at, race:races(name)")
      .match({ id: body.messageId, user_id: user.id })
      .maybeSingle();
    if (!message || !isFresh(message.created_at)) return json(404, { error: "No recent message to announce." });
    const others = await racemates(message.race_id, user.id);
    if (message.kind === "announcement") {
      const race = (message.race as unknown as { name: string } | null)?.name ?? "Your race";
      await sendPush(admin, others.map((o) => o.id), announcementPush(race, message.body));
      return json(200, { notified: others.length });
    }
    const mentioned = mentionedIds(message.body, others);
    await sendPush(admin, mentioned, mentionPush(name, message.body));
    return json(200, { notified: mentioned.length });
  }

  const { data: comment } = await admin
    .from("comments")
    .select("feed_item_id, body, created_at")
    .match({ id: body.commentId, user_id: user.id })
    .maybeSingle();
  const item = comment && isFresh(comment.created_at) ? await feedItem(comment.feed_item_id) : null;
  if (!comment || !item) return json(404, { error: "No recent comment to announce." });

  // The person the post is about, and everyone else who has already joined the thread.
  const { data: thread } = await admin.from("comments").select("user_id").eq("feed_item_id", item.id);
  const others = [...new Set((thread ?? []).map((c) => c.user_id as string))].filter(
    (id) => id !== user.id && id !== item.actorId,
  );
  const owner = item.actorId === user.id ? [] : [item.actorId];
  await sendPush(admin, owner, commentPush(name, comment.body, item, true));
  await sendPush(admin, others, commentPush(name, comment.body, item, false));
  return json(200, { notified: owner.length + others.length });
});
