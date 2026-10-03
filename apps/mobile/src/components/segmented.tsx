import * as Haptics from 'expo-haptics';
import { Pressable, View } from 'react-native';

import { Radius, Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { Text } from './text';

/** A pill-shaped either/or switch, e.g. Run | Walk. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: Radius.pill, padding: 4 }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return;
              Haptics.selectionAsync();
              onChange(o.value);
            }}
            style={{
              flex: 1,
              paddingVertical: Space.sm,
              borderRadius: Radius.pill,
              alignItems: 'center',
              backgroundColor: selected ? colors.surface : 'transparent',
            }}>
            <Text style={{ fontWeight: '800', color: selected ? colors.text : colors.textMuted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
