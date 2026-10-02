export const METERS_PER_MILE = 1609.344;
export const SECONDS_PER_DAY = 86_400;

export const metersToMiles = (m: number): number => m / METERS_PER_MILE;
export const milesToMeters = (mi: number): number => mi * METERS_PER_MILE;

/** Seconds per mile for a given distance and moving time. Infinity for zero distance. */
export const paceSecondsPerMile = (distanceM: number, movingTimeS: number): number =>
  distanceM > 0 ? movingTimeS / metersToMiles(distanceM) : Infinity;

/** "8:05" style pace. */
export function formatPace(secondsPerMile: number): string {
  if (!Number.isFinite(secondsPerMile)) return "--:--";
  const total = Math.round(secondsPerMile);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "1:02:03" or "12:03" style duration. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** "123.4" style miles, never rounding up past a goal the runner hasn't actually hit. */
export function formatMiles(distanceM: number, decimals = 1): string {
  const factor = 10 ** decimals;
  return (Math.floor(metersToMiles(distanceM) * factor) / factor).toFixed(decimals);
}
