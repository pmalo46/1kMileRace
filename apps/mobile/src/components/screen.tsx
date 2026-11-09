import type { PropsWithChildren, Ref } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type RefreshControlProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export function Screen({
  children,
  scroll = true,
  refreshControl,
  transparent = false,
  scrollRef,
  onScroll,
}: PropsWithChildren<{
  scroll?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /** Lets whatever is behind the screen (e.g. a gradient) show through. */
  transparent?: boolean;
  scrollRef?: Ref<ScrollView>;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
}>) {
  const { colors } = useTheme();
  const body = scroll ? (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.content}
      refreshControl={refreshControl}
      onScroll={onScroll}
      scrollEventThrottle={onScroll ? 16 : undefined}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, { flex: 1 }]}>{children}</View>
  );
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: transparent ? 'transparent' : colors.background }}>
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Space.md, gap: Space.md, paddingBottom: Space.xxl * 2 },
});
