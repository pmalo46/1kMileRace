import { useColorScheme } from 'react-native';

import { Palette, type ThemeColors } from './tokens';

export function useTheme(): { colors: ThemeColors; dark: boolean } {
  const dark = useColorScheme() === 'dark';
  return { colors: dark ? Palette.dark : Palette.light, dark };
}
