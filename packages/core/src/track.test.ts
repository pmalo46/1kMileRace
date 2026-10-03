import { describe, expect, it } from "vitest";
import {
  decodePolyline,
  encodePolyline,
  haversineM,
  polylineLengthM,
  summarizeTrack,
  type TrackPoint,
} from "./track.ts";
import { METERS_PER_MILE } from "./units.ts";

/** Meters of latitude per degree, close enough for building test tracks. */
const M_PER_DEG = 111_195;

/** A runner heading due north at `mps`, one fix per second. */
function straightRun(seconds: number, mps: number, opts: { start?: number; segment?: number; lat0?: number } = {}) {
  const start = opts.start ?? 0;
  const pts: TrackPoint[] = [];
  for (let s = 0; s <= seconds; s++) {
    pts.push({ t: start + s * 1000, lat: (opts.lat0 ?? 40) + (s * mps) / M_PER_DEG, lon: -75, acc: 5, segment: opts.segment ?? 0 });
  }
  return pts;
}

describe("haversineM", () => {
  it("measures a degree of latitude", () => {
    expect(haversineM({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(M_PER_DEG, -2);
  });
});

describe("polyline", () => {
  it("round-trips to 5 decimal places", () => {
    const pts = [
      { lat: 38.5, lon: -120.2 },
      { lat: 40.7, lon: -120.95 },
      { lat: 43.252, lon: -126.453 },
    ];
    // Google's documented example.
    expect(encodePolyline(pts)).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual(pts);
  });

  it("measures an encoded route and rejects garbage", () => {
    const route = encodePolyline([
      { lat: 40, lon: -75 },
      { lat: 40.01, lon: -75 },
    ]);
    expect(polylineLengthM(route)).toBeCloseTo(0.01 * M_PER_DEG, -1);
    expect(polylineLengthM("abc")).toBeNull();
  });
});

describe("summarizeTrack", () => {
  it("measures distance, moving time and mile splits for a steady run", () => {
    // 3 m/s for 20 minutes = 3,600 m, about 2.24 mi at an 8:56/mi pace.
    const s = summarizeTrack(straightRun(1200, 3));
    expect(s.distanceM).toBeCloseTo(3600, -1);
    expect(s.movingTimeS).toBe(1200);
    expect(s.splits.map((x) => x.mile)).toEqual([1, 2]);
    expect(s.splits[0]!.movingTimeS).toBeCloseTo(METERS_PER_MILE / 3, -1);
    expect(polylineLengthM(s.polyline)!).toBeCloseTo(s.distanceM, -1);
  });

  it("auto-pauses: standing at a light adds elapsed time but not moving time", () => {
    const first = straightRun(300, 3);
    const last = first[first.length - 1]!;
    // 2 minutes standing still, wobbling within a meter, then carrying on.
    const wait: TrackPoint[] = Array.from({ length: 120 }, (_, k) => ({
      t: last.t + (k + 1) * 1000,
      lat: last.lat + ((k % 2) * 0.5) / M_PER_DEG,
      lon: -75,
      acc: 5,
      segment: 0,
    }));
    const second = straightRun(300, 3, { start: last.t + 121_000, lat0: last.lat });
    const s = summarizeTrack([...first, ...wait, ...second]);
    expect(s.distanceM).toBeCloseTo(1800, -1);
    expect(s.movingTimeS).toBeLessThanOrEqual(605);
  });

  it("drops GPS spikes and imprecise fixes", () => {
    const pts = straightRun(600, 3);
    pts[300] = { ...pts[300]!, lat: pts[300]!.lat + 500 / M_PER_DEG }; // a 500 m jump and back
    pts[400] = { ...pts[400]!, lon: -74.9, acc: 80 }; // a wild, low-accuracy fix
    const s = summarizeTrack(pts);
    expect(s.spikes).toBe(1);
    expect(s.distanceM).toBeCloseTo(1800, -1);
  });

  it("doesn't count distance covered while paused", () => {
    const before = straightRun(300, 3, { segment: 0 });
    // Resumed 1 km further on (e.g. paused and took a bus): not counted.
    const after = straightRun(300, 3, { segment: 1, start: 400_000, lat0: before.at(-1)!.lat + 1000 / M_PER_DEG });
    const s = summarizeTrack([...before, ...after]);
    expect(s.distanceM).toBeCloseTo(1800, -1);
    expect(s.movingTimeS).toBe(600);
  });

  it("counts climbing but not GPS altitude noise", () => {
    const pts = straightRun(600, 3).map((p, k) => ({ ...p, alt: 10 + k * 0.05 + (k % 2) * 1.5 }));
    const s = summarizeTrack(pts);
    expect(s.elevationGainM).toBeGreaterThanOrEqual(27);
    expect(s.elevationGainM).toBeLessThanOrEqual(33);
  });
});
