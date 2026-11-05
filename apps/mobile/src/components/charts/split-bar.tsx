import { View } from 'react-native';

import { Radius, Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { Text } from '../text';

/** One bar split in two, with each side's share written underneath. */
export function SplitBar({ left, right, share }: { left: string; right: string; share: number }) {
  const { colors } = useTheme();
  const leftPct = Math.round(Math.min(Math.max(share, 0), 1) * 100);
  return (
    <View style={{ gap: Space.xs }} accessible accessibilityLabel={`${leftPct}% ${left}, ${100 - leftPct}% ${right}`}>
      <View
        style={{
          height: 14,
          flexDirection: 'row',
          borderRadius: Radius.pill,
          overflow: 'hidden',
          backgroundColor: colors.track,
        }}>
        <View style={{ flex: leftPct, backgroundColor: colors.accent }} />
        <View style={{ flex: 100 - leftPct, backgroundColor: colors.onPace }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text size={14} style={{ fontWeight: '800', color: colors.accent }}>
          {leftPct}% {left}
        </Text>
        <Text size={14} style={{ fontWeight: '800', color: colors.onPace }}>
          {100 - leftPct}% {right}
        </Text>
      </View>
    </View>
  );
}
