import { View } from 'react-native';

import { Radius } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { Text } from '../text';

export interface Bar {
  key: string;
  value: number;
  /** Shown under the bar; leave empty to skip a label when bars are crowded. */
  label?: string;
  highlight?: boolean;
}

/** A simple column chart: the highlighted bars in the accent color, the rest quieter. */
export function Bars({
  bars,
  height = 120,
  accessibilityLabel,
}: {
  bars: Bar[];
  height?: number;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const max = Math.max(...bars.map((b) => b.value), 0);
  const gap = bars.length > 20 ? 2 : 6;
  const labelled = bars.some((b) => b.label);
  return (
    <View accessible accessibilityLabel={accessibilityLabel} style={{ gap: 4 }}>
      <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap }}>
        {bars.map((b) => (
          <View
            key={b.key}
            style={{
              flex: 1,
              // A sliver for empty bars so the timeline still reads as a timeline.
              height: max > 0 ? Math.max(2, (b.value / max) * height) : 2,
              borderRadius: Radius.sm / 2,
              backgroundColor: b.value === 0 ? colors.track : b.highlight ? colors.accent : colors.textMuted,
              opacity: b.value === 0 || b.highlight ? 1 : 0.45,
            }}
          />
        ))}
      </View>
      {labelled && (
        <View style={{ flexDirection: 'row', gap }}>
          {bars.map((b) => (
            <View key={b.key} style={{ flex: 1, alignItems: 'center', overflow: 'visible' }}>
              {/* Crowded bars get short labels that may spill past their bar; roomy ones fit theirs. */}
              <Text
                variant="muted"
                size={11}
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{
                  width: bars.length > 12 ? 40 : '100%',
                  textAlign: 'center',
                }}>
                {b.label ?? ''}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
