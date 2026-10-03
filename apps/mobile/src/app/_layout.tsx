import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/lib/auth';
// Defines the background location task; it has to exist before anything renders.
import '@/lib/recorder';
import { useTheme } from '@/theme/use-theme';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { session, loading } = useAuth();
  const { colors, dark } = useTheme();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);
  if (loading) return null;

  const base = dark ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider
      value={{ ...base, colors: { ...base.colors, background: colors.background, primary: colors.accent } }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(app)" />
          <Stack.Screen name="create-race" options={{ presentation: 'modal' }} />
          <Stack.Screen name="join" options={{ presentation: 'modal' }} />
          <Stack.Screen name="log-run" options={{ presentation: 'modal' }} />
          <Stack.Screen name="record" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
