import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { ART, type ArtName } from '@/lib/art';
import { Radius, Space, Sunrise } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { Text } from './text';

/**
 * One of the race-packet illustrations, square. Until the real artwork is in, a stand-in
 * bib with the asset's name on it, so it's obvious which piece goes where.
 */
export function Art({ name, size = 260 }: { name: ArtName; size?: number }) {
  const source = ART[name] as ImageSource | number | null;
  if (source) {
    return <Image source={source} style={{ width: size, height: size }} contentFit="contain" accessible={false} />;
  }
  return <PlaceholderBib name={name} size={size} />;
}

function PlaceholderBib({ name, size }: { name: ArtName; size: number }) {
  const { colors } = useTheme();
  const width = size * 0.86;
  const height = size * 0.7;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessible={false}>
      <View
        style={[
          styles.bib,
          { width, height, backgroundColor: colors.surface, borderColor: colors.border, transform: [{ rotate: '-3deg' }] },
        ]}>
        <LinearGradient colors={Sunrise} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.stripe} />
        <View style={styles.middle}>
          <Text variant="display" size={size * 0.2}>
            1000
          </Text>
          <Text variant="label">{name}</Text>
        </View>
        {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
          <View
            key={corner}
            style={[
              styles.pin,
              { backgroundColor: colors.textMuted },
              corner[0] === 't' ? { top: Space.sm } : { bottom: Space.sm },
              corner[1] === 'l' ? { left: Space.sm } : { right: Space.sm },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bib: {
    borderRadius: Radius.sm,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  stripe: { height: '18%' },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Space.xs },
  pin: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
});
