import { router } from 'expo-router';
import Storage from 'expo-sqlite/kv-store';

import { forgetSharedRequests } from './races';

/**
 * First-run state, kept on the phone: whether the intro and the Home tour have been seen,
 * and an invite link that arrived before its owner had an account.
 */

function read(key: string): string | null {
  try {
    return Storage.getItemSync(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) Storage.removeItemSync(key);
    else Storage.setItemSync(key, value);
  } catch {
    // Worst case the intro or tour shows once more.
  }
}

const INTRO = 'onboarding:intro-seen';
const INVITE = 'onboarding:pending-invite';
const PUSH_ASKED = 'onboarding:push-asked';
const tourKey = (userId: string) => `onboarding:tour-home:${userId}`;

export const introSeen = () => read(INTRO) !== null;
export const markIntroSeen = () => write(INTRO, new Date().toISOString());

export const tourSeen = (userId: string) => read(tourKey(userId)) !== null;
export const markTourSeen = (userId: string) => write(tourKey(userId), new Date().toISOString());
export const resetTour = (userId: string) => write(tourKey(userId), null);

export const pushAsked = () => read(PUSH_ASKED) !== null;
export const markPushAsked = () => write(PUSH_ASKED, new Date().toISOString());

export const pendingInvite = () => read(INVITE);
export const savePendingInvite = (code: string) => write(INVITE, normalizeInviteCode(code));
export const clearPendingInvite = () => write(INVITE, null);

/** How codes are stored: lowercase, no spaces or dashes. "KMXQ-RTPB" and "kmxqrtpb" are the same code. */
export const normalizeInviteCode = (code: string) => code.replace(/[^a-z0-9]/gi, '').toLowerCase();

/** How codes are shown: eight-letter codes as KMXQ-RTPB, older codes as they are. */
export function formatInviteCode(code: string): string {
  const c = normalizeInviteCode(code);
  return /^[a-z]{8}$/.test(c) ? `${c.slice(0, 4)}-${c.slice(4)}`.toUpperCase() : c;
}

/** The invite code in a link like onekmiles://join?code=abc123, or null if it isn't one. */
export function inviteCodeFromPath(path: string): string | null {
  const match = /(?:^|\/)join\/?\?(?:.*&)?code=([a-z0-9-]+)/i.exec(path);
  return match ? normalizeInviteCode(match[1]!) : null;
}

/**
 * What a friend gets when someone taps Invite: a web link, because messaging apps only make
 * https links tappable. The page there (apps/invite-link) opens the app with the code.
 * Without EXPO_PUBLIC_INVITE_URL set, the app's own link, which works but often isn't tappable.
 */
export function inviteLink(code: string): string {
  const c = encodeURIComponent(normalizeInviteCode(code));
  const base = process.env.EXPO_PUBLIC_INVITE_URL?.replace(/\/+$/, '');
  return base ? `${base}/join/${c}` : `onekmiles://join?code=${c}`;
}

/** Leaves the join or create screen; the first time, by way of the notifications ask. */
export function afterJoining() {
  clearPendingInvite();
  forgetSharedRequests();
  if (pushAsked()) router.back();
  else router.replace('/nudges');
}
