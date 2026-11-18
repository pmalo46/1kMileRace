import { formatQuote, milestoneQuote } from "./quotes.ts";
import { METERS_PER_MILE, formatMiles } from "./units.ts";

/** A push notification before it's addressed to anyone. `url` is the in-app route it opens. */
export interface PushMessage {
  title: string;
  body: string;
  url: string;
}

/** The parts of a feed item a notification needs to describe it. */
export interface FeedItemSummary {
  id: string;
  type: "activity" | "milestone" | "finish" | "joined";
  miles?: number | null;
  activity?: { type: "run" | "walk"; distanceM: number } | null;
}

const BODY_LIMIT = 140;
const commentsUrl = (feedItemId: string) => `/comments?item=${feedItemId}`;

/** "your 3.2 mile run", "you hitting 500 miles": how a feed item reads to the person it's about. */
function yours(item: FeedItemSummary): string {
  if (item.type === "activity" && item.activity) {
    return `your ${formatMiles(item.activity.distanceM)} mile ${item.activity.type}`;
  }
  if (item.type === "finish") return "you finishing the race";
  if (item.type === "milestone" && item.miles) return `you hitting ${item.miles.toLocaleString("en-US")} miles`;
  if (item.type === "joined") return "you joining the race";
  return "your post";
}

/** Sent to the person a feed item is about when someone cheers it. */
export function cheerPush(cheerer: string, emoji: string, item: FeedItemSummary): PushMessage {
  return { title: `${cheerer} cheered ${emoji}`, body: `For ${yours(item)}.`, url: commentsUrl(item.id) };
}

/** Sent to the person a feed item is about, and to others already in the thread. An empty body is a GIF. */
export function commentPush(author: string, body: string, item: FeedItemSummary, toOwner: boolean): PushMessage {
  const text = body.trim().replace(/\s+/g, " ") || "Sent a GIF";
  return {
    title: toOwner ? `${author} commented on ${yours(item)}` : `${author} also commented`,
    body: text.length > BODY_LIMIT ? `${text.slice(0, BODY_LIMIT - 1).trimEnd()}…` : text,
    url: commentsUrl(item.id),
  };
}

const milesLabel = (miles: number) => `${miles.toLocaleString("en-US")} ${miles === 1 ? "mile" : "miles"}`;

/** Sent to the rest of the race when a runner reaches a milestone or finishes. */
export function milestonePush(runner: string, kind: "milestone" | "finish", miles: number, race: string): PushMessage {
  const distance = milesLabel(miles);
  return kind === "finish"
    ? { title: `${runner} finished ${race}! 🏁`, body: `All ${distance}. Send congratulations.`, url: "/feed" }
    : { title: `${runner} hit ${distance} 🎉`, body: `Send a cheer in ${race}.`, url: "/feed" };
}

/** Sent to the runner themselves, with that milestone's quote. */
export function ownMilestonePush(kind: "milestone" | "finish", miles: number, race: string): PushMessage {
  const title = kind === "finish" ? `You finished ${race}! 🏁` : `You hit ${milesLabel(miles)} 🎉`;
  return { title, body: formatQuote(milestoneQuote(miles)), url: "/" };
}

/**
 * Sent to someone a runner just moved past. A nudge to cheer them, and a reminder that
 * the gap is one run, not a ranking.
 */
export function overtakePush(
  runner: string,
  type: "run" | "walk",
  gapM: number,
  race: string,
  feedItemId: string | null,
): PushMessage {
  const gap = gapM < METERS_PER_MILE / 10 ? "Neck and neck" : `${formatMiles(gapM)} mi apart`;
  return {
    title: `${runner} ${type === "walk" ? "walked" : "ran"} past you ${type === "walk" ? "🚶" : "🏃"}`,
    body: `${gap} in ${race}. Send a cheer.`,
    url: feedItemId ? commentsUrl(feedItemId) : "/leaderboard",
  };
}

const clip = (text: string) => {
  const flat = text.trim().replace(/\s+/g, " ");
  return flat.length > BODY_LIMIT ? `${flat.slice(0, BODY_LIMIT - 1).trimEnd()}…` : flat;
};

/** Where a reviewer reads why a run was held, in a sentence. Flags as the rules engine wrote them. */
export function reviewReason(flags: { code: string; message: string }[]): string {
  const unusual = flags.filter((f) => f.code !== "manual_entry");
  if (unusual.length > 0) return unusual.map((f) => f.message).join(" ");
  return "Added by hand.";
}

/** Sent to a race's organizers and marshals when a run needs a second look. */
export function reviewNeededPush(
  runner: string,
  type: "run" | "walk",
  distanceM: number,
  flags: { code: string; message: string }[],
): PushMessage {
  return {
    title: `${runner}'s ${formatMiles(distanceM)} mi ${type} needs a second look`,
    body: clip(reviewReason(flags)),
    url: "/admin",
  };
}

/** Sent to the runner once an organizer or marshal has decided. */
export function reviewedPush(
  decision: "approve" | "reject",
  type: "run" | "walk",
  distanceM: number,
  note: string | null,
): PushMessage {
  const what = `Your ${formatMiles(distanceM)} mi ${type}`;
  return decision === "approve"
    ? { title: `${what} counts ✓`, body: "An organizer checked it. Keep them coming.", url: "/my-race" }
    : {
        title: `${what} wasn't counted`,
        body: note?.trim() ? clip(note) : "An organizer turned it down. If that looks wrong, ask them about it.",
        url: "/my-race",
      };
}

/** Sent to someone @mentioned in the race chat. An empty body is a GIF. */
export function mentionPush(author: string, body: string): PushMessage {
  return { title: `${author} mentioned you`, body: clip(body) || "Sent a GIF", url: "/feed?tab=chat" };
}

/** Sent to everyone in the race when an organizer posts an announcement. */
export function announcementPush(race: string, body: string): PushMessage {
  return { title: `📣 ${race}`, body: clip(body), url: "/feed?tab=chat" };
}

/**
 * Who a chat message @mentions, matched against the race's members by display name (any
 * case, longest name first so "@Ann Lee" isn't read as "@Ann"). "@everyone" isn't special.
 */
export function mentionedIds(body: string, members: { id: string; name: string }[]): string[] {
  const text = body.toLowerCase();
  const found = new Set<string>();
  const byLength = [...members].filter((m) => m.name.trim()).sort((a, b) => b.name.length - a.name.length);
  let i = text.indexOf("@");
  while (i !== -1) {
    const rest = text.slice(i + 1);
    const hit = byLength.find((m) => {
      const name = m.name.trim().toLowerCase();
      if (!rest.startsWith(name)) return false;
      const next = rest.charAt(name.length);
      return next === "" || !/[\p{L}\p{N}_]/u.test(next);
    });
    if (hit) found.add(hit.id);
    i = text.indexOf("@", i + 1);
  }
  return [...found];
}
