import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Polyline } from 'react-native-svg';

import { Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { Text } from '../text';

export interface Series {
  label: string;
  values: number[];
  /** A dashed, quiet line for reference (like even pace). */
  reference?: boolean;
}

/** Lines over the same points in time, scaled together, with a legend underneath. */
export function LineChart({
  series,
  height = 140,
  accessibilityLabel,
}: {
  series: Series[];
  height?: number;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const n = Math.max(...series.map((s) => s.values.length), 0);
  const max = Math.max(...series.flatMap((s) => s.values), 1);
  const pad = 4;
  const x = (i: number) => pad + (n > 1 ? (i / (n - 1)) * (width - pad * 2) : (width - pad * 2) / 2);
  const y = (v: number) => pad + (1 - v / max) * (height - pad * 2);

  return (
    <View style={{ gap: Space.sm }} accessible accessibilityLabel={accessibilityLabel}>
      <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <Svg width={width} height={height}>
            {series.map((s) => {
              const color = s.reference ? colors.textMuted : colors.accent;
              const points = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
              const last = s.values.length - 1;
              return (
                <G key={s.label}>
                  <Polyline
                    points={points}
                    fill="none"
                    stroke={color}
                    strokeWidth={s.reference ? 2 : 3}
                    strokeDasharray={s.reference ? '6 6' : undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {!s.reference && last >= 0 && <Circle cx={x(last)} cy={y(s.values[last]!)} r={5} fill={color} />}
                </G>
              );
            })}
          </Svg>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: Space.md, flexWrap: 'wrap' }}>
        {series.map((s) => (
          <View
            key={s.label}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: Space.xs,
            }}>
            <View style={{ flexDirection: 'row', gap: 3 }}>
              {(s.reference ? [0, 1, 2] : [0]).map((i) => (
                <View
                  key={i}
                  style={{
                    width: s.reference ? 4 : 18,
                    height: 3,
                    borderRadius: 2,
                    backgroundColor: s.reference ? colors.textMuted : colors.accent,
                  }}
                />
              ))}
            </View>
            <Text variant="muted" size={13}>
              {s.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
