import { METERS_PER_MILE } from "./units.ts";

/** One GPS fix from the phone. `segment` increases each time a paused recording resumes. */
export interface TrackPoint {
  /** Epoch milliseconds. */
  t: number;
  lat: number;
  lon: number;
  /** Horizontal accuracy radius in meters, if the OS reported one. */
  acc?: number | null;
  alt?: number | null;
  segment: number;
}

export interface TrackSummary {
  distanceM: number;
  movingTimeS: number;
  elevationGainM: number;
  /** Google encoded polyline of the points that counted. */
  polyline: string;
  /** Cumulative moving time at each whole mile. */
  splits: { mile: number; movingTimeS: number }[];
  /** Fixes dropped as implausible jumps. */
  spikes: number;
}

/** Fixes less precise than this are ignored. */
export const MAX_ACCURACY_M = 35;
/** Jumps faster than this (about a 3:00/mi pace) are GPS glitches, not running. */
export const MAX_SPEED_MPS = 9;
/** Slower than this (about a 54:00/mi pace) counts as stopped, i.e. auto-pause. */
export const MIN_MOVING_SPEED_MPS = 0.5;
/** Ignore wobble smaller than this while standing still. */
const MIN_STEP_M = 3;
/** Altitude changes smaller than this are treated as GPS noise. */
const ELEVATION_NOISE_M = 3;

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in meters. */
export function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Turns raw fixes into distance, moving time, elevation, splits and a route.
 * The same function runs live on the phone and when the recording is saved, and
 * the server re-measures the resulting polyline (see evaluateActivity).
 */
export function summarizeTrack(points: TrackPoint[]): TrackSummary {
  const kept: TrackPoint[] = [];
  const splits: TrackSummary["splits"] = [];
  let distanceM = 0;
  let movingMs = 0;
  let spikes = 0;
  let climbM = 0;
  let altBase: number | null = null;
  let prev: TrackPoint | null = null;

  const sorted = [...points].sort((a, b) => a.t - b.t);
  for (const p of sorted) {
    if (p.acc != null && p.acc > MAX_ACCURACY_M) continue;
    if (!prev || p.segment !== prev.segment) {
      prev = p;
      kept.push(p);
      altBase = p.alt ?? altBase;
      continue;
    }
    const d = haversineM(prev, p);
    const dtMs = p.t - prev.t;
    if (dtMs <= 0) continue;
    if (d / (dtMs / 1000) > MAX_SPEED_MPS) {
      spikes++;
      continue;
    }
    if (d < MIN_STEP_M) continue;

    const before = distanceM;
    distanceM += d;
    if (d / (dtMs / 1000) >= MIN_MOVING_SPEED_MPS) movingMs += dtMs;
    for (let mile = Math.floor(before / METERS_PER_MILE) + 1; mile * METERS_PER_MILE <= distanceM; mile++) {
      splits.push({ mile, movingTimeS: Math.round(movingMs / 1000) });
    }

    if (p.alt != null) {
      if (altBase == null) altBase = p.alt;
      else if (p.alt - altBase >= ELEVATION_NOISE_M) {
        climbM += p.alt - altBase;
        altBase = p.alt;
      } else if (altBase - p.alt >= ELEVATION_NOISE_M) {
        altBase = p.alt;
      }
    }
    prev = p;
    kept.push(p);
  }

  return {
    distanceM,
    movingTimeS: Math.round(movingMs / 1000),
    elevationGainM: Math.round(climbM),
    polyline: encodePolyline(kept),
    splits,
    spikes,
  };
}

/** Google's encoded polyline format, 5 decimal places. */
export function encodePolyline(points: { lat: number; lon: number }[]): string {
  let out = "";
  let lastLat = 0;
  let lastLon = 0;
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lon = Math.round(p.lon * 1e5);
    out += encodeValue(lat - lastLat) + encodeValue(lon - lastLon);
    lastLat = lat;
    lastLon = lon;
  }
  return out;
}

function encodeValue(v: number): string {
  let n = v < 0 ? ~(v << 1) : v << 1;
  let s = "";
  while (n >= 0x20) {
    s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
    n >>= 5;
  }
  return s + String.fromCharCode(n + 63);
}

export function decodePolyline(encoded: string): { lat: number; lon: number }[] {
  const points: { lat: number; lon: number }[] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      if (i >= encoded.length) throw new Error("Truncated polyline");
      b = encoded.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < encoded.length) {
    lat += next();
    lon += next();
    points.push({ lat: lat / 1e5, lon: lon / 1e5 });
  }
  return points;
}

/** Length of an encoded route in meters, or null if it can't be decoded. */
export function polylineLengthM(encoded: string): number | null {
  let pts: { lat: number; lon: number }[];
  try {
    pts = decodePolyline(encoded);
  } catch {
    return null;
  }
  let total = 0;
  for (let k = 1; k < pts.length; k++) total += haversineM(pts[k - 1]!, pts[k]!);
  return total;
}
