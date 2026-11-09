import { inviteCodeFromPath, savePendingInvite } from '@/lib/onboarding';

/**
 * Every link into the app passes through here first. An invite link's code is kept, so it
 * survives the trip through the intro and sign-up when the person tapping it is new.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const code = inviteCodeFromPath(path);
    if (code) savePendingInvite(code);
  } catch {
    // A link that can't be read still opens the app.
  }
  return path;
}
