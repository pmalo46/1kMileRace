import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';

import { Radius, Sunrise } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export function ProgressBar({
  progress,
  height = 8,
  muted = false,
}: {
  progress: number;
  height?: number;
  /** A quiet gray fill, for bars that are context around the one that matters. */
  muted?: boolean;
}) {
  const { colors } = useTheme();
  const pct = `${Math.min(Math.max(progress, 0), 1) * 100}%` as const;
  if (muted) {
    return (
      <View style={{ height, borderRadius: Radius.pill, backgroundColor: colors.track, overflow: 'hidden' }}>
        <View style={{ width: pct, height: '100%', borderRadius: Radius.pill, backgroundColor: colors.textMuted }} />
      </View>
    );
  }
  return (
    <View style={{ height, borderRadius: Radius.pill, backgroundColor: colors.track, overflow: 'hidden' }}>
      <LinearGradient
        colors={Sunrise}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ width: pct, height: '100%', borderRadius: Radius.pill }}
      />
    </View>
  );
}
