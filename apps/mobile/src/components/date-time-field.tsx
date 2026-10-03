import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, View } from 'react-native';

import { Radius, Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { Text } from './text';

interface Props {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
}

/** A date and time, picked inline on iOS and through the date then time dialogs on Android. */
export function DateTimeField({ label, value, onChange, minimumDate, maximumDate }: Props) {
  const { colors, dark } = useTheme();

  const openAndroid = () =>
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      minimumDate,
      maximumDate,
      onChange: (event, date) => {
        if (event.type !== 'set' || !date) return;
        DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          onChange: (e, time) => {
            if (e.type === 'set' && time) onChange(time);
          },
        });
      },
    });

  return (
    <View style={{ gap: Space.xs }}>
      <Text variant="label">{label}</Text>
      {Platform.OS === 'ios' ? (
        <View style={{ alignItems: 'flex-start' }}>
          <DateTimePicker
            value={value}
            mode="datetime"
            display="compact"
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            accentColor={colors.accent}
            themeVariant={dark ? 'dark' : 'light'}
            onChange={(_, date) => date && onChange(date)}
          />
        </View>
      ) : (
        <Pressable
          onPress={openAndroid}
          accessibilityRole="button"
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: Radius.md,
            paddingHorizontal: Space.md,
            minHeight: 52,
            justifyContent: 'center',
          }}>
          <Text>
            {value.toLocaleString([], {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
