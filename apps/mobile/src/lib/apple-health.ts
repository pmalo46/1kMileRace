import { activityFromAppleWorkout, healthKitQuantity } from '@1k/core';
import { Linking, Platform } from 'react-native';

import {
  emptySync,
  handledStore,
  importWorkout,
  syncWindowStart,
  type HealthStatus,
  type HealthSync,
  type SeenWorkout,
} from './health-import';
import { inExpoGo } from './runtime';

/**
 * Importing runs and walks from Apple Health, where the Apple Watch, Garmin, Strava, Nike
 * Run Club and others save their workouts. Read only: 1K Miles never writes to Health.
 *
 * The library is native and loaded defensively: in Expo Go, on Android, or in an iOS build
 * made before it was added, importing is simply unavailable.
 */
type HealthKit = typeof import('@kingstinct/react-native-healthkit');
let HK: HealthKit | null = null;
if (Platform.OS === 'ios' && !inExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    HK = require('@kingstinct/react-native-healthkit') as HealthKit;
  } catch {
    HK = null;
  }
}

const OUR_BUNDLE = 'com.onekmiles.app';
const WORKOUTS = 'HKWorkoutTypeIdentifier';
const READS = { toRead: [WORKOUTS, 'HKQuantityTypeIdentifierDistanceWalkingRunning'] as const };
/** HKAuthorizationRequestStatus.unnecessary: the runner has already answered the prompt. */
const ALREADY_ASKED = 2;

const APP_NAMES: Record<string, string> = {
  'com.apple.health': 'Apple Watch',
  'com.apple.Fitness': 'Apple Watch',
  'com.garmin.connect.mobile': 'Garmin Connect',
  'com.strava.stravaride': 'Strava',
  'com.nike.nikeplus-gps': 'Nike Run Club',
  'com.fitbit.FitbitMobile': 'Fitbit',
};

/**
 * Apple never says whether reading was allowed, only whether the runner has been asked, so
 * "connected" means asked. Someone who said no simply has no workouts come through, and the
 * health screen tells them where to change it.
 */
export async function healthStatus(): Promise<HealthStatus> {
  if (!HK) return 'unsupported';
  try {
    if (!(await HK.isHealthDataAvailableAsync())) return 'unsupported';
    const status = await HK.getRequestStatusForAuthorization(READS);
    return Number(status) === ALREADY_ASKED ? 'connected' : 'not-connected';
  } catch {
    return 'unsupported';
  }
}

/** Shows Apple Health's permission sheet. True once the runner has answered it. */
export async function connectHealth(): Promise<boolean> {
  if (!HK) return false;
  await HK.requestAuthorization(READS);
  return (await healthStatus()) === 'connected';
}

/** Apple doesn't allow opening Health's own permission screen, so this opens the app's Settings. */
export function openHealthSettings() {
  Linking.openSettings();
}

const handled = handledStore('apple-health:handled:v1');
let syncing: Promise<HealthSync> | null = null;

/** Reads the last week's workouts and logs each new run or walk, like Health Connect's sync. */
export function syncHealth(userId: string, toFinishM?: number): Promise<HealthSync> {
  syncing ??= readAndLog(userId, toFinishM).finally(() => {
    syncing = null;
  });
  return syncing;
}

async function readAndLog(userId: string, toFinishM?: number): Promise<HealthSync> {
  const summary = emptySync();
  const hk = HK;
  if (!hk || (await healthStatus()) !== 'connected') return summary;

  const now = new Date();
  const workouts = await hk.queryWorkoutSamples({
    limit: 0,
    ascending: true,
    filter: { date: { startDate: syncWindowStart(now), endDate: now } },
  });

  const done = handled.load();
  for (const proxy of workouts) {
    // Plain values, then release the native workout right away.
    const w = proxy.toJSON();
    proxy.dispose();

    const bundle = w.sourceRevision?.source?.bundleIdentifier ?? '';
    if (bundle === OUR_BUNDLE) continue;
    const seen: SeenWorkout = {
      id: w.uuid,
      app: APP_NAMES[bundle] ?? w.sourceRevision?.source?.name ?? 'Another app',
      startedAt: new Date(w.startDate).toISOString(),
      distanceM: 0,
      outcome: 'seen-before',
    };
    summary.seen.unshift(seen);
    if (done[w.uuid]) continue;
    // Workouts typed into Health by hand aren't imported; they belong in "Add a run by hand".
    const metadata = (w.metadata ?? {}) as Record<string, unknown>;
    if (metadata.HKWasUserEntered === true) {
      seen.outcome = 'hand-entered';
      continue;
    }

    const distanceM = healthKitQuantity(w.totalDistance, 'distance') ?? 0;
    seen.distanceM = distanceM;
    const activity = activityFromAppleWorkout({
      id: w.uuid,
      activityType: Number(w.workoutActivityType),
      startTime: new Date(w.startDate).toISOString(),
      endTime: new Date(w.endDate).toISOString(),
      distanceM,
      durationS: healthKitQuantity(w.duration, 'time'),
      indoor: metadata.HKIndoorWorkout === true,
      deviceName: w.device?.name ?? w.sourceRevision?.productType ?? null,
    });
    if (!activity) {
      seen.outcome = 'not-run-or-walk';
      continue;
    }

    await importWorkout(activity, { userId, now, toFinishM, seen, summary, handled: done });
  }
  handled.save(done);
  return summary;
}
