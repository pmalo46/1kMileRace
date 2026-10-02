import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';

import { Radius, Sunrise } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export function ProgressBar({ progress, height = 8 }: { progress: number; height?: number }) {
  const { colors } = useTheme();
  const pct = `${Math.min(Math.max(progress, 0), 1) * 100}%` as const;
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
