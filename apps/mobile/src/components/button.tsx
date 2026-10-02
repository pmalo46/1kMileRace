import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Radius, Space, Sunrise } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { Text } from './text';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
  disabled?: boolean;
}

export function Button({ title, onPress, variant = 'primary', loading, disabled }: ButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  const press = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };
  const label = loading ? (
    <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.text} />
  ) : (
    <Text style={{ color: variant === 'primary' ? '#fff' : colors.text, fontWeight: '800', fontSize: 17 }}>
      {title}
    </Text>
  );
  return (
    <Pressable
      onPress={press}
      disabled={inactive}
      accessibilityRole="button"
      style={({ pressed }) => [{ opacity: inactive ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
      {variant === 'primary' ? (
        <LinearGradient colors={Sunrise} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.base}>
          {label}
        </LinearGradient>
      ) : (
        <View style={[styles.base, { backgroundColor: colors.surfaceAlt }]}>{label}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 54,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.lg,
  },
});
