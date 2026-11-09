import Storage from 'expo-sqlite/kv-store';

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

export const normalizeInviteCode = (code: string) => code.trim().toLowerCase();

/** The invite code in a link like onekmiles://join?code=abc123, or null if it isn't one. */
export function inviteCodeFromPath(path: string): string | null {
  const match = /(?:^|\/)join\/?\?(?:.*&)?code=([a-z0-9]+)/i.exec(path);
  return match ? normalizeInviteCode(match[1]!) : null;
}

/** What a friend gets when someone taps Invite. */
export function inviteLink(code: string): string {
  return `onekmiles://join?code=${encodeURIComponent(code)}`;
}
