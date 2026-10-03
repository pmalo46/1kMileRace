import { summarizeTrack, type TrackPoint, type TrackSummary } from '@1k/core';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import { openDatabaseSync } from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';

import { LogError, logActivity, type ActivityDraft, type LogResult } from './activities';

/**
 * GPS run recording. Every fix is written to an on-device SQLite database as it
 * arrives, so a run survives the app being killed, a crash, or having no signal;
 * finished runs wait there until they upload.
 *
 * In a development or store build, tracking runs as a background location task
 * (an Android foreground service with a notification), so it keeps going with the
 * screen locked. Expo Go can't run background location, so there it falls back to
 * watching location while the app is open.
 */

export const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const LOCATION_TASK = 'record-run-location';

export type RecordingState = 'recording' | 'paused' | 'finished' | 'uploaded' | 'rejected';

export interface Recording {
  id: string;
  type: 'run' | 'walk';
  state: RecordingState;
  /** Increases on every resume, so the gap while paused isn't measured. */
  segment: number;
  started_at: number;
  finished_at: number | null;
  /** Stopwatch time banked before the latest resume; pauses don't count. */
  active_ms: number;
  resumed_at: number;
  /** 1 if any fix came from a mock-location app (Android). */
  mocked: number;
}

/** The stopwatch: time spent recording, not counting pauses. */
export const activeMs = (rec: Recording, now = Date.now()) =>
  rec.active_ms + (rec.state === 'recording' ? now - rec.resumed_at : 0);

const db = openDatabaseSync('recordings.db');
db.execSync(`
  create table if not exists recordings (
    id text primary key,
    type text not null,
    state text not null,
    segment integer not null default 0,
    started_at integer not null,
    finished_at integer,
    active_ms integer not null default 0,
    resumed_at integer not null,
    mocked integer not null default 0
  );
  create table if not exists points (
    recording_id text not null,
    t integer not null,
    lat real not null,
    lon real not null,
    acc real,
    alt real,
    segment integer not null
  );
  create index if not exists points_by_recording on points (recording_id, t);
`);

function appendLocations(locations: Location.LocationObject[]) {
  const rec = db.getFirstSync<Recording>(`select * from recordings where state = 'recording' limit 1`);
  if (!rec) return;
  db.withTransactionSync(() => {
    for (const l of locations) {
      if (l.timestamp < rec.started_at) continue; // a cached fix from before the start
      db.runSync(`insert into points (recording_id, t, lat, lon, acc, alt, segment) values (?, ?, ?, ?, ?, ?, ?)`, [
        rec.id,
        l.timestamp,
        l.coords.latitude,
        l.coords.longitude,
        l.coords.accuracy,
        l.coords.altitude,
        rec.segment,
      ]);
      if (l.mocked) db.runSync(`update recordings set mocked = 1 where id = ?`, [rec.id]);
    }
  });
}

// Background tasks must be defined at module scope, before anything renders.
if (!inExpoGo) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (!error && data?.locations) appendLocations(data.locations);
  });
}

const trackingOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  distanceInterval: 5,
  timeInterval: 1000,
} as const;

let watcher: Location.LocationSubscription | null = null;

export type TrackingMode = 'background' | 'foreground';

/** Starts GPS updates, in the background if the build and permissions allow it. */
async function startTracking(): Promise<TrackingMode> {
  if (!inExpoGo) {
    const start = () =>
      Location.startLocationUpdatesAsync(LOCATION_TASK, {
        ...trackingOptions,
        activityType: Location.LocationActivityType.Fitness,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Recording your run',
          notificationBody: 'Measuring distance and pace. Open 1K Miles to pause or finish.',
          notificationColor: '#F2552C',
          killServiceOnDestroy: false,
        },
      });
    try {
      await start();
      return 'background';
    } catch {
      // Some OS versions want "allow all the time" before background updates can start.
      const { granted } = await Location.requestBackgroundPermissionsAsync();
      if (granted) {
        try {
          await start();
          return 'background';
        } catch {
          // Fall back to foreground tracking below.
        }
      }
    }
  }
  watcher?.remove();
  watcher = await Location.watchPositionAsync(trackingOptions, (l) => appendLocations([l]));
  return 'foreground';
}

async function stopTracking() {
  watcher?.remove();
  watcher = null;
  if (!inExpoGo && (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false))) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}

const getRecording = (id: string) => db.getFirstSync<Recording>(`select * from recordings where id = ?`, [id]);

/** A recording that's still going (or paused), e.g. after the app was closed mid-run. */
export { getRecording };

export const currentRecording = () =>
  db.getFirstSync<Recording>(`select * from recordings where state in ('recording', 'paused') order by started_at desc limit 1`);

/** Finished recordings that haven't reached the server yet. */
export const unsyncedRecordings = () =>
  db.getAllSync<Recording>(`select * from recordings where state = 'finished' order by started_at`);

/** Asks for location access and starts recording. Returns null if permission was denied. */
export async function startRecording(type: Recording['type']): Promise<{ recording: Recording; mode: TrackingMode } | null> {
  const { granted } = await Location.requestForegroundPermissionsAsync();
  if (!granted) return null;
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const now = Date.now();
  db.runSync(`insert into recordings (id, type, state, started_at, resumed_at) values (?, ?, 'recording', ?, ?)`, [
    id,
    type,
    now,
    now,
  ]);
  const mode = await startTracking();
  return { recording: getRecording(id)!, mode };
}

export async function pauseRecording(id: string) {
  db.runSync(
    `update recordings set state = 'paused', active_ms = active_ms + (? - resumed_at) where id = ? and state = 'recording'`,
    [Date.now(), id],
  );
  await stopTracking();
}

export async function resumeRecording(id: string): Promise<TrackingMode> {
  db.runSync(`update recordings set state = 'recording', segment = segment + 1, resumed_at = ? where id = ?`, [
    Date.now(),
    id,
  ]);
  return startTracking();
}

/** Restarts GPS for a recording that was running when the app was closed. */
export async function reattachRecording(rec: Recording): Promise<TrackingMode | null> {
  if (rec.state !== 'recording') return null;
  if (!inExpoGo && (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false))) {
    return 'background';
  }
  db.runSync(`update recordings set segment = segment + 1 where id = ?`, [rec.id]);
  return startTracking();
}

export async function finishRecording(id: string) {
  await stopTracking();
  const now = Date.now();
  db.runSync(
    `update recordings set
       active_ms = active_ms + case when state = 'recording' then ? - resumed_at else 0 end,
       state = 'finished',
       finished_at = ?
     where id = ?`,
    [now, now, id],
  );
}

export async function discardRecording(id: string) {
  await stopTracking();
  db.withTransactionSync(() => {
    db.runSync(`delete from points where recording_id = ?`, [id]);
    db.runSync(`delete from recordings where id = ?`, [id]);
  });
}

export function recordingPoints(id: string): TrackPoint[] {
  return db.getAllSync<TrackPoint>(
    `select t, lat, lon, acc, alt, segment from points where recording_id = ? order by t`,
    [id],
  );
}

export function summarize(id: string): TrackSummary {
  return summarizeTrack(recordingPoints(id));
}

function draftFor(rec: Recording, summary: TrackSummary): ActivityDraft {
  const endedAt = rec.finished_at ?? Date.now();
  const elapsedTimeS = Math.max(1, Math.round((endedAt - rec.started_at) / 1000));
  return {
    source: 'app_gps',
    sourceExternalId: rec.id,
    type: rec.type,
    environment: 'outdoor',
    startedAt: new Date(rec.started_at).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    distanceM: summary.distanceM,
    movingTimeS: Math.min(Math.max(1, summary.movingTimeS), elapsedTimeS),
    elapsedTimeS,
    elevationGainM: summary.elevationGainM,
    polyline: summary.polyline,
    mockedLocation: rec.mocked === 1,
    evidenceCount: 0,
  };
}

/**
 * Sends a finished recording to the server. A 409 means an earlier attempt already
 * landed, so the recording counts as uploaded; a 422 means the rules rejected it, so
 * retrying won't help. On other failures (e.g. offline) it stays queued.
 */
export async function uploadRecording(userId: string, id: string): Promise<LogResult | 'already-saved'> {
  const rec = getRecording(id);
  if (!rec) throw new LogError('That recording is gone.');
  try {
    const result = await logActivity(userId, draftFor(rec, summarize(id)));
    markDone(id, 'uploaded');
    return result;
  } catch (e) {
    if (e instanceof LogError && e.status === 409) {
      markDone(id, 'uploaded');
      return 'already-saved';
    }
    if (e instanceof LogError && e.status === 422) markDone(id, 'rejected');
    throw e;
  }
}

/** Once the server has decided, keep only the recording's row; the raw points are dropped. */
function markDone(id: string, state: 'uploaded' | 'rejected') {
  db.withTransactionSync(() => {
    db.runSync(`update recordings set state = ? where id = ?`, [state, id]);
    db.runSync(`delete from points where recording_id = ?`, [id]);
  });
}
