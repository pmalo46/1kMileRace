import type { PropsWithChildren } from 'react';
import { View, type ViewStyle } from 'react-native';

import { Radius, Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: Radius.lg,
          padding: Space.md,
          gap: Space.sm,
          borderWidth: 1,
          borderColor: colors.border,
        },
        style,
      ]}>
      {children}
    </View>
  );
}
