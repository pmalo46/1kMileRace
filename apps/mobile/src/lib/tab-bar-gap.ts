import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Room to leave under a text box at the bottom of a tab, so the floating tab bar doesn't
 * cover it. Tab screens report the bar as part of their bottom safe area. While the keyboard
 * is up the box sits on the keyboard instead, so no extra room is needed.
 */
export function useTabBarGap(): number {
  const { bottom } = useSafeAreaInsets();
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setKeyboard(true),
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setKeyboard(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return keyboard ? 0 : bottom;
}
