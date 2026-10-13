import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Vibration } from 'react-native';

import { inExpoGo } from './runtime';
import { supabase } from './supabase';

/**
 * Push notifications (cheers, comments, milestones) and the one local notification the
 * app raises itself: crossing the finish line mid-run.
 *
 * expo-notifications throws on import in a build made before it was added, so it's
 * loaded defensively; on such a build notifications are simply off.
 */
type NotificationsModule = typeof import('expo-notifications');
let Notifications: NotificationsModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require('expo-notifications') as NotificationsModule;
} catch {
  Notifications = null;
}

const DEFAULT_CHANNEL = 'default';
const FINISH_CHANNEL = 'finish';
/** Long enough to feel through a pocket, and unlike any other buzz the app makes. */
const FINISH_VIBRATION = [0, 700, 200, 700, 200, 1100];

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Android shows no permission prompt until a channel exists, so channels come first. */
async function ensureChannels(N: NotificationsModule) {
  if (Platform.OS !== 'android') return;
  await N.setNotificationChannelAsync(DEFAULT_CHANNEL, {
    name: 'Cheers, comments and milestones',
    importance: N.AndroidImportance.DEFAULT,
  });
  await N.setNotificationChannelAsync(FINISH_CHANNEL, {
    name: 'Crossing the finish line',
    importance: N.AndroidImportance.MAX,
    enableVibrate: true,
    vibrationPattern: FINISH_VIBRATION,
  });
}

/** Asks for permission if it hasn't been settled yet. True when notifications can be shown. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!Notifications || Platform.OS === 'web') return false;
  try {
    await ensureChannels(Notifications);
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Saves this device's push token for the signed-in user, so the server can reach them. */
export async function registerForPush(): Promise<void> {
  if (!Notifications || inExpoGo) return;
  if (!(await ensureNotificationPermission())) return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    if (error) throw new Error(error.message);
  } catch (e) {
    // Offline, or push credentials aren't set up for this build. Tried again next launch.
    console.warn('Push registration failed:', e);
  }
}

/**
 * The buzz and lock-screen notice when a run in progress reaches the finish line.
 * Called from the background location task, so it can't rely on the app being on screen.
 */
export async function announceFinish(): Promise<void> {
  let shown = false;
  if (Notifications && (await ensureNotificationPermission())) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'You crossed the finish line! 🏁',
          body: 'That’s the whole race. Your finish time is set; keep going or stop whenever you like.',
          vibrate: FINISH_VIBRATION,
          sound: true,
        },
        trigger: { channelId: FINISH_CHANNEL },
      });
      shown = true;
    } catch {
      shown = false;
    }
  }
  // Without notification permission the phone should still buzz.
  if (!shown) Vibration.vibrate(FINISH_VIBRATION);
}

/** Opens the screen a notification points at (its `data.url`) when it's tapped. */
export function useNotificationRouting(signedIn: boolean) {
  useEffect(() => {
    const N = Notifications;
    if (!N || !signedIn) return;
    const open = (data: Record<string, unknown> | undefined) => {
      if (typeof data?.url === 'string') router.push(data.url as Href);
    };
    // The app was closed and a tap on a notification launched it.
    const launch = N.getLastNotificationResponse();
    if (launch) {
      open(launch.notification.request.content.data);
      N.clearLastNotificationResponse();
    }
    const subscription = N.addNotificationResponseReceivedListener((response) =>
      open(response.notification.request.content.data),
    );
    return () => subscription.remove();
  }, [signedIn]);
}
