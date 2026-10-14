import {
  ActivityInput,
  DEFAULT_RACE_RULES,
  SECONDS_PER_DAY,
  activityFromHealthSession,
  evaluateActivity,
  type ImportedActivity,
} from '@1k/core';
import { Platform } from 'react-native';

import { LogError, logActivity } from './activities';
import { inExpoGo } from './runtime';

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

export type HealthStatus =
  /** This build or phone can't use Health Connect at all. */
  | 'unsupported'
  /** Health Connect needs installing or updating from the Play Store. */
  | 'needs-install'
  /** Available, but the runner hasn't allowed 1K Miles to read workouts. */
  | 'not-connected'
  | 'connected';

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

// --- Remembering what's been dealt with -----------------------------------------------

/**
 * Workouts already decided on, by Health Connect record id, so each is sent to the server
 * once. Kept on the phone; entries outlive the window workouts can be logged in.
 */
// v2: earlier builds also remembered workouts the phone turned away, which hid them for good.
const HANDLED_KEY = 'health-connect:handled:v2';
const KEEP_HANDLED_MS = 30 * SECONDS_PER_DAY * 1000;

function loadHandled(): Record<string, number> {
  try {
    const all = JSON.parse(localStorage.getItem(HANDLED_KEY) ?? '{}') as Record<string, number>;
    const cutoff = Date.now() - KEEP_HANDLED_MS;
    return Object.fromEntries(Object.entries(all).filter(([, at]) => at > cutoff));
  } catch {
    return {};
  }
}

// --- Importing -------------------------------------------------------------------------

/** What became of one workout Health Connect shared. */
export type WorkoutOutcome =
  | 'imported'
  | 'already-logged'
  /** Imported or turned away on an earlier check. */
  | 'seen-before'
  | 'not-run-or-walk'
  /** Typed into another app by hand, not recorded by it. */
  | 'hand-entered'
  | 'no-distance'
  | 'not-counted'
  | 'failed';

/** One workout as Health Connect reported it, for showing the runner what was found. */
export interface SeenWorkout {
  id: string;
  /** The app that recorded it, by name where it's a well-known one. */
  app: string;
  startedAt: string;
  distanceM: number;
  outcome: WorkoutOutcome;
  /** Why the rules turned it away, when they did. */
  reason?: string;
}

const APP_NAMES: Record<string, string> = {
  'com.google.android.apps.fitness': 'Google Fit',
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.garmin.android.apps.connectmobile': 'Garmin Connect',
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.strava': 'Strava',
  'com.google.android.apps.healthdata': 'Health Connect',
};

export interface HealthSync {
  /** Every workout Health Connect shared from the last week, newest first. */
  seen: SeenWorkout[];
  /** Runs and walks that now count, newest last. */
  imported: ImportedActivity[];
  /** Already logged, for example the same run was also recorded in the app. */
  alreadyLogged: number;
  /** Found, but the race rules turned them away (most often: under a mile). */
  notCounted: number;
  /** Couldn't reach the server; they'll be tried again next time. */
  failed: number;
}

/**
 * Reads the last week's workouts and logs each new run or walk. The server applies the
 * same rules and duplicate checks as for any other run, so a run recorded both on a watch
 * and in the app counts once.
 */
export async function syncHealth(userId: string, toFinishM?: number): Promise<HealthSync> {
  const summary: HealthSync = { seen: [], imported: [], alreadyLogged: 0, notCounted: 0, failed: 0 };
  const hc = HC;
  if (!hc || (await healthStatus()) !== 'connected') return summary;

  const now = new Date();
  const since = new Date(now.getTime() - DEFAULT_RACE_RULES.lateLogDays * SECONDS_PER_DAY * 1000);
  const { records } = await hc.readRecords('ExerciseSession', {
    timeRangeFilter: { operator: 'between', startTime: since.toISOString(), endTime: now.toISOString() },
    ascendingOrder: true,
  });

  const handled = loadHandled();
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
    if (handled[id]) continue;
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

    // The rules run here first so a short walk doesn't cost a round trip. Nothing decided
    // on the phone is remembered: the recording app may still be syncing the distance, so
    // the workout gets another look next time.
    const parsed = ActivityInput.safeParse(activity);
    const verdict = parsed.success ? evaluateActivity(parsed.data, DEFAULT_RACE_RULES, now, { toFinishM }) : null;
    if (!verdict || verdict.status === 'rejected') {
      summary.notCounted++;
      seen.outcome = activity.distanceM > 0 ? 'not-counted' : 'no-distance';
      seen.reason = verdict?.issues.find((i) => i.severity === 'reject')?.message;
      continue;
    }

    try {
      await logActivity(userId, activity);
      summary.imported.push(activity);
      seen.outcome = 'imported';
      handled[id] = Date.now();
    } catch (e) {
      if (e instanceof LogError && e.status === 409) {
        summary.alreadyLogged++;
        seen.outcome = 'already-logged';
        handled[id] = Date.now();
      } else if (e instanceof LogError && e.status === 422) {
        summary.notCounted++;
        seen.outcome = 'not-counted';
        seen.reason = e.message;
        handled[id] = Date.now();
      } else {
        summary.failed++;
        seen.outcome = 'failed';
      }
    }
  }
  localStorage.setItem(HANDLED_KEY, JSON.stringify(handled));
  return summary;
}
