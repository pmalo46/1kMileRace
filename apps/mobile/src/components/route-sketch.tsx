import { decodePolyline, paceStretches, type RoutePoint, type TrackPoint } from '@1k/core';
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Polyline, Rect, Stop } from 'react-native-svg';

import { Text } from './text';
import { Radius, Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const PADDING = 16;
const WIDTH = 320;

/** Slowest to fastest, for coloring a route by pace. */
const PACE_COLORS = ['#F5B700', '#FF8A3D', '#FF4D6D'] as const;
/** Paces closer together than this (sec/mile) are one steady pace: no point shading them. */
const STEADY_SPREAD_S = 20;

type Point = { lat: number; lon: number; segment: number };

/** Fits the points to the box. Equirectangular projection: fine at the scale of a run. */
function project(points: Point[], height: number): [number, number][] {
  const k = Math.cos((points[0]!.lat * Math.PI) / 180);
  const xs = points.map((p) => p.lon * k);
  const ys = points.map((p) => -p.lat);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 1e-6);
  const scale = Math.min(WIDTH - 2 * PADDING, height - 2 * PADDING) / span;
  const offX = (WIDTH - (Math.max(...xs) - minX) * scale) / 2;
  const offY = (height - (Math.max(...ys) - minY) * scale) / 2;
  return points.map((_, i) => [offX + (xs[i]! - minX) * scale, offY + (ys[i]! - minY) * scale]);
}

const svgPoints = (xy: [number, number][]) => xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

function hex(c: string): number[] {
  return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
}
/** 0 = slowest color, 1 = fastest. */
function paceColor(t: number): string {
  const scaled = Math.min(1, Math.max(0, t)) * (PACE_COLORS.length - 1);
  const i = Math.min(PACE_COLORS.length - 2, Math.floor(scaled));
  const a = hex(PACE_COLORS[i]!);
  const b = hex(PACE_COLORS[i + 1]!);
  const f = scaled - i;
  return `rgb(${a.map((v, k) => Math.round(v + (b[k]! - v) * f)).join(',')})`;
}

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;

/** The recorded route drawn to fit its box. No map tiles, just the line you ran. */
export function RouteSketch({ points, height = 220 }: { points: Point[]; height?: number }) {
  const { colors } = useTheme();
  const xy = useMemo(() => (points.length < 2 ? [] : project(points, height)), [points, height]);

  const lines = useMemo(() => {
    const bySegment = new Map<number, [number, number][]>();
    points.forEach((p, i) => {
      const seg = bySegment.get(p.segment);
      if (seg) seg.push(xy[i]!);
      else bySegment.set(p.segment, [xy[i]!]);
    });
    return [...bySegment.values()].map((pts) => ({ points: svgPoints(pts), color: colors.accent }));
  }, [points, xy, colors.accent]);

  return <Sketch lines={lines} xy={xy} height={height} />;
}

/**
 * A just-finished run's route, shaded by pace: yellow where it was slowest, red where it was
 * fastest, relative to the rest of the same run. A steady run stays one color.
 */
export function PacedRoute({ route, height = 220 }: { route: RoutePoint[]; height?: number }) {
  const { colors } = useTheme();
  const xy = useMemo(() => (route.length < 2 ? [] : project(route, height)), [route, height]);

  const { lines, shaded } = useMemo(() => {
    const stretches = paceStretches(route);
    const paces = stretches.flatMap((s) => (s.paceS == null ? [] : [s.paceS])).sort((a, b) => a - b);
    // Ignore the odd GPS wobble at either end so it doesn't wash out the rest.
    const fast = paces.length ? quantile(paces, 0.1) : 0;
    const slow = paces.length ? quantile(paces, 0.9) : 0;
    const shaded = slow - fast >= STEADY_SPREAD_S;
    return {
      shaded,
      lines: stretches.map((s) => ({
        points: svgPoints(xy.slice(s.from, s.to + 1)),
        color: shaded && s.paceS != null ? paceColor((slow - s.paceS) / (slow - fast)) : colors.accent,
      })),
    };
  }, [route, xy, colors.accent]);

  return (
    <View style={{ gap: Space.sm }}>
      <Sketch lines={lines} xy={xy} height={height} />
      {shaded && <PaceKey />}
    </View>
  );
}

function Sketch({ lines, xy, height }: { lines: { points: string; color: string }[]; xy: [number, number][]; height: number }) {
  const { colors } = useTheme();
  const first = xy[0];
  const last = xy.at(-1);
  return (
    <View style={{ height, borderRadius: Radius.lg, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="xMidYMid meet">
        {lines.map((l, i) => (
          <Polyline
            key={i}
            points={l.points}
            fill="none"
            stroke={l.color}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {first && <Circle cx={first[0]} cy={first[1]} r={6} fill={colors.onPace} />}
        {last && <Circle cx={last[0]} cy={last[1]} r={7} fill={colors.accent} stroke={colors.surface} strokeWidth={3} />}
      </Svg>
    </View>
  );
}

function PaceKey() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.sm }}>
      <Text variant="muted" size={13}>
        Slower
      </Text>
      <Svg width={96} height={8}>
        <Defs>
          <LinearGradient id="pace" x1="0" y1="0" x2="1" y2="0">
            {PACE_COLORS.map((c, i) => (
              <Stop key={c} offset={i / (PACE_COLORS.length - 1)} stopColor={c} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect width={96} height={8} rx={4} fill="url(#pace)" />
      </Svg>
      <Text variant="muted" size={13}>
        Faster
      </Text>
    </View>
  );
}

/** A saved route (as stored on the run, Google-encoded) drawn in one color, e.g. on a feed post. */
export function SavedRoute({ polyline, height = 150 }: { polyline: string; height?: number }) {
  const points = useMemo<TrackPoint[]>(() => {
    try {
      return decodePolyline(polyline).map((p) => ({ ...p, t: 0, segment: 0 }));
    } catch {
      return [];
    }
  }, [polyline]);
  if (points.length < 2) return null;
  return <RouteSketch points={points} height={height} />;
}
