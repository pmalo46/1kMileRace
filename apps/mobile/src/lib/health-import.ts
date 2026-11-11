import {
  ActivityInput,
  DEFAULT_RACE_RULES,
  SECONDS_PER_DAY,
  evaluateActivity,
  type ImportedActivity,
} from '@1k/core';

import { LogError, logActivity } from './activities';

/**
 * What Apple Health and Health Connect imports share: how a found workout is reported, the
 * memory of workouts already dealt with, and sending one to the server under the race rules.
 */

export type HealthStatus =
  /** This build or phone can't use the health store at all. */
  | 'unsupported'
  /** Health Connect needs installing or updating from the Play Store (Android only). */
  | 'needs-install'
  /** Available, but the runner hasn't been asked to let 1K Miles read workouts. */
  | 'not-connected'
  | 'connected';

/** What became of one workout the health store shared. */
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

/** One workout as the health store reported it, for showing the runner what was found. */
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

export interface HealthSync {
  /** Every workout the health store shared from the last week, newest first. */
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

export const emptySync = (): HealthSync => ({ seen: [], imported: [], alreadyLogged: 0, notCounted: 0, failed: 0 });

/** How far back a sync looks: as far as a run can still be logged. */
export const syncWindowStart = (now: Date) =>
  new Date(now.getTime() - DEFAULT_RACE_RULES.lateLogDays * SECONDS_PER_DAY * 1000);

/**
 * Workouts already decided on, by the health store's id, so each is sent to the server once.
 * Kept on the phone; entries outlive the window workouts can be logged in.
 */
const KEEP_HANDLED_MS = 30 * SECONDS_PER_DAY * 1000;

export function handledStore(key: string) {
  const load = (): Record<string, number> => {
    try {
      const all = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, number>;
      const cutoff = Date.now() - KEEP_HANDLED_MS;
      return Object.fromEntries(Object.entries(all).filter(([, at]) => at > cutoff));
    } catch {
      return {};
    }
  };
  // Added to what's stored now rather than replacing it, so nothing another sync noted is lost.
  const save = (handled: Record<string, number>) => localStorage.setItem(key, JSON.stringify({ ...load(), ...handled }));
  return { load, save };
}

/**
 * Checks one imported workout against the race rules and, if it can count, sends it to the
 * server. Records the outcome on `seen` and `summary`, and marks it handled once the server
 * has decided. Nothing decided on the phone is remembered: the recording app may still be
 * syncing the distance, so the workout gets another look next time.
 */
export async function importWorkout(
  activity: ImportedActivity,
  ctx: {
    userId: string;
    now: Date;
    toFinishM?: number;
    seen: SeenWorkout;
    summary: HealthSync;
    handled: Record<string, number>;
  },
): Promise<void> {
  const { seen, summary, handled } = ctx;
  const parsed = ActivityInput.safeParse(activity);
  const verdict = parsed.success
    ? evaluateActivity(parsed.data, DEFAULT_RACE_RULES, ctx.now, { toFinishM: ctx.toFinishM })
    : null;
  if (!verdict || verdict.status === 'rejected') {
    summary.notCounted++;
    seen.outcome = activity.distanceM > 0 ? 'not-counted' : 'no-distance';
    seen.reason = verdict?.issues.find((i) => i.severity === 'reject')?.message;
    return;
  }

  try {
    await logActivity(ctx.userId, activity);
    summary.imported.push(activity);
    seen.outcome = 'imported';
    handled[seen.id] = Date.now();
  } catch (e) {
    if (e instanceof LogError && e.status === 409) {
      summary.alreadyLogged++;
      seen.outcome = 'already-logged';
      handled[seen.id] = Date.now();
    } else if (e instanceof LogError && e.status === 422) {
      summary.notCounted++;
      seen.outcome = 'not-counted';
      seen.reason = e.message;
      handled[seen.id] = Date.now();
    } else {
      summary.failed++;
      seen.outcome = 'failed';
    }
  }
}
