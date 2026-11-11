import 'expo-sqlite/localStorage/install';

import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in apps/mobile/.env');
}

/**
 * How long any request to Supabase may take. React Native's fetch never gives up on its own,
 * and the auth client runs its work one call at a time, so a single request stalled on a bad
 * connection used to freeze everything after it (joining a race spun forever until the app
 * was restarted). Now it fails, the caller shows an error, and the next request goes through.
 */
const REQUEST_TIMEOUT_MS = 15_000;

export class RequestTimeoutError extends Error {
  constructor() {
    super('The request took too long. Check your connection and try again.');
    this.name = 'RequestTimeoutError';
  }
}

const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const outer = init?.signal;
  if (outer?.aborted) controller.abort();
  outer?.addEventListener('abort', () => controller.abort(), { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal })
    .catch((e: unknown) => {
      throw timedOut ? new RequestTimeoutError() : e;
    })
    .finally(() => clearTimeout(timer));
};

/** Where the client keeps the signed-in session (supabase-js's default key for this project). */
export const SESSION_STORAGE_KEY = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;

export const supabase = createClient(url, key, {
  global: { fetch: fetchWithTimeout },
  auth: {
    storageKey: SESSION_STORAGE_KEY,
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

/** Words for a failed request: connection trouble in plain language, anything else as the server said it. */
export function errorMessage(error: { message?: string } | null | undefined): string {
  const message = error?.message ?? '';
  if (/took too long|network request failed|aborted|failed to fetch/i.test(message)) {
    return "Couldn't connect. Check your connection and try again.";
  }
  return message || 'Something went wrong. Try again.';
}
