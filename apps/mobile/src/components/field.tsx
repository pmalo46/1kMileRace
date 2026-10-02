import { TextInput, type TextInputProps, View } from 'react-native';

import { Radius, Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { Text } from './text';

export function Field({ label, ...rest }: TextInputProps & { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: Space.xs }}>
      <Text variant="label">{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: Radius.md,
          paddingHorizontal: Space.md,
          minHeight: 52,
          fontSize: 17,
          color: colors.text,
        }}
        {...rest}
      />
    </View>
  );
}
