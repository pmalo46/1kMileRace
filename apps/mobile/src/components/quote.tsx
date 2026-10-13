import type { Quote as QuoteData } from '@1k/core';
import { View, type ViewStyle } from 'react-native';

import { Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { Text } from './text';

/**
 * A line of encouragement, set apart from the surrounding screen by an accent bar.
 * `tone="onColor"` is for quotes sitting on the brand gradient.
 */
export function Quote({
  quote,
  size = 18,
  align = 'left',
  tone = 'default',
  style,
}: {
  quote: QuoteData;
  size?: number;
  align?: 'left' | 'center';
  tone?: 'default' | 'onColor';
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const onColor = tone === 'onColor';
  const centered = align === 'center';
  return (
    <View
      accessible
      accessibilityLabel={quote.author ? `${quote.text} ${quote.author}` : quote.text}
      style={[
        { gap: Space.xs },
        centered
          ? { alignItems: 'center' }
          : { borderLeftWidth: 3, borderLeftColor: onColor ? '#fff' : colors.accent, paddingLeft: Space.md },
        style,
      ]}>
      <Text
        size={size}
        style={{
          fontStyle: 'italic',
          fontWeight: '600',
          lineHeight: Math.round(size * 1.35),
          textAlign: align,
          color: onColor ? '#fff' : colors.text,
        }}>
        {quote.author ? `“${quote.text}”` : quote.text}
      </Text>
      {quote.author && (
        <Text variant={onColor ? 'body' : 'muted'} size={13} style={{ textAlign: align, color: onColor ? '#fff' : undefined }}>
          {quote.author}
        </Text>
      )}
    </View>
  );
}
