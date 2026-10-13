// Sends push notifications through the Expo Push Service to every device a set of users
// has registered (push_tokens).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PushMessage } from "@1k/core";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
/** The most messages Expo accepts in one request. */
const BATCH = 100;
/** The Android channel the app creates for these (apps/mobile/src/lib/notifications.ts). */
const CHANNEL = "activity";

/**
 * Never throws: a push that can't be sent must not fail the request that caused it.
 * Tokens Expo reports as no longer registered (app uninstalled, notifications revoked)
 * are forgotten.
 */
export async function sendPush(admin: SupabaseClient, userIds: string[], message: PushMessage): Promise<void> {
  try {
    const recipients = [...new Set(userIds)];
    if (recipients.length === 0) return;
    const { data: rows, error } = await admin.from("push_tokens").select("token").in("user_id", recipients);
    if (error) throw new Error(error.message);
    const tokens = (rows ?? []).map((r) => r.token as string);

    // Only needed if "enhanced push security" is switched on for the Expo account.
    const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
    for (let i = 0; i < tokens.length; i += BATCH) {
      const batch = tokens.slice(i, i + BATCH);
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(
          batch.map((to) => ({
            to,
            title: message.title,
            body: message.body,
            data: { url: message.url },
            sound: "default",
            channelId: CHANNEL,
            priority: "high",
          })),
        ),
      });
      const result = (await res.json().catch(() => null)) as
        | { data?: { status: string; details?: { error?: string } }[] }
        | null;
      if (!res.ok) throw new Error(`Expo push service answered ${res.status}`);
      const gone = batch.filter((_, k) => result?.data?.[k]?.details?.error === "DeviceNotRegistered");
      if (gone.length > 0) await admin.from("push_tokens").delete().in("token", gone);
    }
  } catch (e) {
    console.error("Push not sent:", e);
  }
}
