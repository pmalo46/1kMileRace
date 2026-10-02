import { Text as RNText, type TextProps } from 'react-native';

import { Type } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

type Variant = 'display' | 'heading' | 'body' | 'label' | 'muted';

export function Text({ variant = 'body', style, size, ...rest }: TextProps & { variant?: Variant; size?: number }) {
  const { colors } = useTheme();
  const base =
    variant === 'display'
      ? [Type.display, { fontSize: size ?? 56, color: colors.text }]
      : variant === 'heading'
        ? [Type.heading, { color: colors.text }]
        : variant === 'label'
          ? [Type.label, { color: colors.textMuted }]
          : variant === 'muted'
            ? [Type.body, { color: colors.textMuted }]
            : [Type.body, { color: colors.text }];
  return <RNText style={[...base, size ? { fontSize: size } : null, style]} {...rest} />;
}
