import { activityFromHealthSession } from '@1k/core';
import { Platform } from 'react-native';

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

export type { HealthStatus, HealthSync, SeenWorkout, WorkoutOutcome } from './health-import';

/**
 * Importing runs and walks recorded by a watch or another fitness app, through Android's
 * Health Connect. Garmin, Fitbit, Samsung Health and others write their workouts there.
 *
 * The library throws on import in a build made before it was added (and in Expo Go), so
 * it's loaded defensively; where it's missing, importing is simply unavailable.
 */
type HealthConnect = typeof import('react-native-health-connect');
let HC: HealthConnect | null = null;
if (Platform.OS === 'android' && !inExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    HC = require('react-native-health-connect') as HealthConnect;
  } catch {
    HC = null;
  }
}

const OUR_PACKAGE = 'com.onekmiles.app';
/** Health Connect's Metadata.RECORDING_METHOD_MANUAL_ENTRY. */
const MANUAL_ENTRY = 3;
const READS = [
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'Distance' },
] as const;

async function hasAccess(hc: HealthConnect): Promise<boolean> {
  const granted = await hc.getGrantedPermissions();
  return READS.every((want) =>
    granted.some((g) => g.accessType === want.accessType && g.recordType === want.recordType),
  );
}

export async function healthStatus(): Promise<HealthStatus> {
  if (!HC) return 'unsupported';
  try {
    const sdk = await HC.getSdkStatus();
    if (sdk === HC.SdkAvailabilityStatus.SDK_UNAVAILABLE) return 'unsupported';
    if (sdk !== HC.SdkAvailabilityStatus.SDK_AVAILABLE) return 'needs-install';
    await HC.initialize();
    return (await hasAccess(HC)) ? 'connected' : 'not-connected';
  } catch {
    return 'unsupported';
  }
}

/** Shows Health Connect's permission screen. True if reading workouts was allowed. */
export async function connectHealth(): Promise<boolean> {
  if (!HC) return false;
  await HC.initialize();
  await HC.requestPermission([...READS]);
  return hasAccess(HC);
}

/** Opens Health Connect's own settings, where access can be changed or removed. */
export function openHealthSettings() {
  HC?.openHealthConnectSettings();
}

// Workouts already decided on. v2: earlier builds also remembered workouts the phone turned
// away, which hid them for good.
const handled = handledStore('health-connect:handled:v2');

// --- Importing -------------------------------------------------------------------------

const APP_NAMES: Record<string, string> = {
  'com.google.android.apps.fitness': 'Google Fit',
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.garmin.android.apps.connectmobile': 'Garmin Connect',
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.strava': 'Strava',
  'com.google.android.apps.healthdata': 'Health Connect',
};

let syncing: Promise<HealthSync> | null = null;

/**
 * Reads the last week's workouts and logs each new run or walk. The server applies the
 * same rules and duplicate checks as for any other run, so a run recorded both on a watch
 * and in the app counts once. A sync asked for while one is running (Home's, say, and
 * "Sync now") shares it, so no workout is sent twice.
 */
export function syncHealth(userId: string, toFinishM?: number): Promise<HealthSync> {
  syncing ??= readAndLog(userId, toFinishM).finally(() => {
    syncing = null;
  });
  return syncing;
}

async function readAndLog(userId: string, toFinishM?: number): Promise<HealthSync> {
  const summary = emptySync();
  const hc = HC;
  if (!hc || (await healthStatus()) !== 'connected') return summary;

  const now = new Date();
  const since = syncWindowStart(now);
  const { records } = await hc.readRecords('ExerciseSession', {
    timeRangeFilter: { operator: 'between', startTime: since.toISOString(), endTime: now.toISOString() },
    ascendingOrder: true,
  });

  const done = handled.load();
  for (const record of records) {
    const id = record.metadata?.id;
    const origin = record.metadata?.dataOrigin;
    if (!id || origin === OUR_PACKAGE) continue;
    const seen: SeenWorkout = {
      id,
      app: (origin && APP_NAMES[origin]) ?? origin ?? 'Another app',
      startedAt: record.startTime,
      distanceM: 0,
      outcome: 'seen-before',
    };
    summary.seen.unshift(seen);
    if (done[id]) continue;
    // Runs typed into another app by hand aren't imported: the import is for what a watch
    // or app actually recorded. A run entered by hand belongs in "Add a run by hand" here,
    // where it's marked for review like any other.
    if (record.metadata?.recordingMethod === MANUAL_ENTRY) {
      seen.outcome = 'hand-entered';
      continue;
    }

    const span = { operator: 'between', startTime: record.startTime, endTime: record.endTime } as const;
    // Distance from the app that recorded the workout, so a phone's step count isn't added on top.
    const fromOrigin = origin ? { dataOriginFilter: [origin] } : {};
    let distanceM = (await hc.aggregateRecord({ recordType: 'Distance', timeRangeFilter: span, ...fromOrigin }))
      .DISTANCE.inMeters;
    if (!distanceM && origin) {
      distanceM = (await hc.aggregateRecord({ recordType: 'Distance', timeRangeFilter: span })).DISTANCE.inMeters;
    }
    const activeS = await hc
      .aggregateRecord({ recordType: 'ExerciseSession', timeRangeFilter: span, ...fromOrigin })
      .then((a) => a.EXERCISE_DURATION_TOTAL.inSeconds)
      .catch(() => null);

    seen.distanceM = distanceM ?? 0;

    const activity = activityFromHealthSession({
      id,
      exerciseType: record.exerciseType,
      startTime: record.startTime,
      endTime: record.endTime,
      distanceM: distanceM ?? 0,
      activeS,
      deviceName: [record.metadata?.device?.manufacturer, record.metadata?.device?.model].filter(Boolean).join(' '),
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
