import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { supabase } from '@/lib/supabase';
import { Space } from '@/theme/tokens';

/** Where the emailed sign-in link lands: trades the one-time code for a session. */
export default function AuthCallback() {
  const { code, error_description } = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const [error, setError] = useState<string | null>(error_description ?? null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || error_description) return;
    started.current = true;
    if (!code) return setError('That link is missing its sign-in code.');
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      // The code verifier lives on the phone that requested the link, so opening it anywhere
      // else (or after reinstalling) fails here.
      if (error) setError('Open the newest link on the same phone you requested it from, or request a new one.');
      else router.replace('/');
    });
  }, [code, error_description]);

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: Space.md }}>
        {error ? (
          <>
            <Text variant="heading" style={{ textAlign: 'center' }}>
              That link didn’t work
            </Text>
            <Text variant="muted" style={{ textAlign: 'center' }}>
              {error}
            </Text>
            <View style={{ alignSelf: 'stretch' }}>
              <Button title="Back to sign in" onPress={() => router.replace('/sign-in')} />
            </View>
          </>
        ) : (
          <>
            <ActivityIndicator />
            <Text variant="muted">Signing you in…</Text>
          </>
        )}
      </View>
    </Screen>
  );
}
