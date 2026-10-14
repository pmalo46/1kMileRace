import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';

import { Sunrise } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { Text } from './text';

/** A medal for one milestone: sunrise-filled once earned, a dashed outline until then. */
export function MilestoneBadge({ miles, earned, size = 56 }: { miles: number; earned: boolean; size?: number }) {
  const { colors } = useTheme();
  const label = miles >= 1000 ? `${miles / 1000}K` : String(miles);
  const text = (
    <Text
      variant="display"
      size={label.length > 2 ? size * 0.28 : size * 0.36}
      style={{ color: earned ? '#fff' : colors.textMuted }}>
      {label}
    </Text>
  );
  return (
    <View
      accessible
      accessibilityLabel={`${miles.toLocaleString()} mile badge, ${earned ? 'earned' : 'not yet earned'}`}
      style={{ alignItems: 'center', width: size }}>
      {earned ? (
        <LinearGradient
          colors={Sunrise}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: size, height: size, borderRadius: size / 2, padding: 3 }}>
          <View
            style={{
              flex: 1,
              borderRadius: size / 2,
              borderWidth: 1.5,
              borderColor: '#ffffff99',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            {text}
          </View>
        </LinearGradient>
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {text}
        </View>
      )}
      {/* The ribbon tails that make a circle read as a medal. */}
      <View style={{ flexDirection: 'row', gap: 3, marginTop: -3, zIndex: -1 }}>
        {[0, 1].map((i) => (
          <View
            key={i}
            style={{
              width: size * 0.16,
              height: size * 0.2,
              backgroundColor: earned ? Sunrise[i] : 'transparent',
              borderBottomLeftRadius: 2,
              borderBottomRightRadius: 2,
              borderWidth: earned ? 0 : 1,
              borderColor: colors.border,
              borderStyle: 'dashed',
              transform: [{ rotate: i === 0 ? '12deg' : '-12deg' }],
            }}
          />
        ))}
      </View>
    </View>
  );
}
