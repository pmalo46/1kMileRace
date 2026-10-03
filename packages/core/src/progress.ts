import { SECONDS_PER_DAY } from "./units.ts";

export interface RaceWindow {
  startsAt: Date;
  endsAt: Date;
  goalM: number;
}

export interface PaceStatus {
  /** Distance an even-pace runner would have covered by now. */
  expectedM: number;
  /** Positive = ahead of even pace. */
  aheadByM: number;
  /** Distance per day needed from now on to finish in time; 0 once finished. */
  requiredDailyM: number;
  daysRemaining: number;
  finished: boolean;
}

export function paceStatus(totalM: number, race: RaceWindow, now: Date = new Date()): PaceStatus {
  const span = race.endsAt.getTime() - race.startsAt.getTime();
  const elapsed = Math.min(Math.max(now.getTime() - race.startsAt.getTime(), 0), span);
  const expectedM = (race.goalM * elapsed) / span;
  const remainingMs = span - elapsed;
  const daysRemaining = remainingMs / 1000 / SECONDS_PER_DAY;
  const finished = totalM >= race.goalM;
  const left = Math.max(race.goalM - totalM, 0);
  const requiredDailyM = finished ? 0 : daysRemaining > 0 ? left / daysRemaining : Infinity;
  return { expectedM, aheadByM: totalM - expectedM, requiredDailyM, daysRemaining, finished };
}

/** Projected moving time for the full goal at the runner's current average pace. */
export function projectedGoalMovingTimeS(totalM: number, totalMovingS: number, goalM: number): number | null {
  if (totalM <= 0) return null;
  return (totalMovingS / totalM) * goalM;
}

/** Results are provisional until late-logged activities can no longer change them. */
export function isResultOfficial(finishedAt: Date, lateLogDays: number, now: Date = new Date()): boolean {
  return now.getTime() - finishedAt.getTime() > lateLogDays * SECONDS_PER_DAY * 1000;
}
