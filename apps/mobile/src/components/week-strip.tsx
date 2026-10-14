import { View } from 'react-native';

import { useTheme } from '@/theme/use-theme';

import { Text } from './text';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Monday to Sunday: a filled dot for each day with a run, a ring around today. */
export function WeekStrip({ ran, today }: { ran: boolean[]; today: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {DAYS.map((letter, i) => (
        <View key={i} style={{ alignItems: 'center', gap: 4 }}>
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: ran[i] ? colors.accent : 'transparent',
              borderWidth: ran[i] ? 0 : i === today ? 2 : 1,
              borderColor: i === today ? colors.accent : colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            {ran[i] && <Text style={{ color: colors.onAccent, fontWeight: '800' }}>✓</Text>}
          </View>
          <Text variant="muted" size={12} style={i === today ? { color: colors.text, fontWeight: '800' } : undefined}>
            {letter}
          </Text>
        </View>
      ))}
    </View>
  );
}
