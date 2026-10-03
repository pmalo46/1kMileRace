import type { TrackPoint } from '@1k/core';
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { Radius } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const PADDING = 16;

/** The recorded route drawn to fit its box. No map tiles, just the line you ran. */
export function RouteSketch({ points, height = 220 }: { points: TrackPoint[]; height?: number }) {
  const { colors } = useTheme();
  const width = 320;

  const segments = useMemo(() => {
    if (points.length < 2) return [];
    // Equirectangular projection: fine at the scale of a run.
    const k = Math.cos((points[0]!.lat * Math.PI) / 180);
    const xs = points.map((p) => p.lon * k);
    const ys = points.map((p) => -p.lat);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 1e-6);
    const scale = Math.min(width - 2 * PADDING, height - 2 * PADDING) / span;
    const offX = (width - (Math.max(...xs) - minX) * scale) / 2;
    const offY = (height - (Math.max(...ys) - minY) * scale) / 2;
    const bySegment = new Map<number, string[]>();
    points.forEach((p, i) => {
      const xy = `${(offX + (xs[i]! - minX) * scale).toFixed(1)},${(offY + (ys[i]! - minY) * scale).toFixed(1)}`;
      const seg = bySegment.get(p.segment);
      if (seg) seg.push(xy);
      else bySegment.set(p.segment, [xy]);
    });
    return [...bySegment.values()].map((xy) => xy.join(' '));
  }, [points, height]);

  const last = segments.at(-1)?.split(' ').at(-1)?.split(',').map(Number);
  const first = segments[0]?.split(' ')[0]?.split(',').map(Number);

  return (
    <View style={{ height, borderRadius: Radius.lg, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        {segments.map((pts, i) => (
          <Polyline
            key={i}
            points={pts}
            fill="none"
            stroke={colors.accent}
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
