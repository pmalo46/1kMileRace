import { formatQuote, milestoneQuote } from "./quotes.ts";
import { formatMiles } from "./units.ts";

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

/** Sent to the person a feed item is about, and to others already in the thread. */
export function commentPush(author: string, body: string, item: FeedItemSummary, toOwner: boolean): PushMessage {
  const text = body.trim().replace(/\s+/g, " ");
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
    ? { title: `${runner} finished ${race}! 🏁`, body: `All ${distance}. Go say congratulations.`, url: "/feed" }
    : { title: `${runner} hit ${distance} 🎉`, body: `Send a cheer in ${race}.`, url: "/feed" };
}

/** Sent to the runner themselves, with that milestone's quote. */
export function ownMilestonePush(kind: "milestone" | "finish", miles: number, race: string): PushMessage {
  const title = kind === "finish" ? `You finished ${race}! 🏁` : `You hit ${milesLabel(miles)} 🎉`;
  return { title, body: formatQuote(milestoneQuote(miles)), url: "/" };
}
