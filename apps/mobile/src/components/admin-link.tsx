import { Pressable, View } from 'react-native';

import { Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { Card } from './card';
import { Text } from './text';

/** My Race's way into race admin, for organizers and marshals, with how many runs wait on them. */
export function AdminLink({ waiting, onPress }: { waiting: number; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityHint="Opens race admin">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: Space.sm }}>
        <View style={{ flex: 1 }}>
          <Text variant="label">Race admin</Text>
          <Text variant="heading" size={18}>
            {waiting > 0 ? `${waiting} ${waiting === 1 ? 'run' : 'runs'} to review` : 'Nothing waiting on you'}
          </Text>
        </View>
        <Text variant="muted" size={22} style={{ color: waiting > 0 ? colors.accent : colors.textMuted }}>
          ›
        </Text>
      </Card>
    </Pressable>
  );
}
