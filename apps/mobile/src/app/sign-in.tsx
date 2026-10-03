import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, View } from 'react-native';

import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { ProgressRing } from '@/components/progress-ring';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { supabase } from '@/lib/supabase';
import { Space } from '@/theme/tokens';

/**
 * Passwordless: we email a sign-in link that opens the app at /auth-callback.
 * Apple/Google sign-in come with the dev build.
 */
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const sendLink = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: Linking.createURL('auth-callback') },
    });
    setBusy(false);
    if (error) return Alert.alert('Could not send the link', error.message);
    setSent(true);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ alignItems: 'center', marginTop: Space.xl, gap: Space.md }}>
          <ProgressRing progress={0.62} size={180} stroke={16}>
            <Text variant="display" size={44}>
              1K
            </Text>
          </ProgressRing>
          <Text variant="heading" size={30} style={{ textAlign: 'center' }}>
            1,000 miles.{'\n'}One year. Together.
          </Text>
          <Text variant="muted" style={{ textAlign: 'center' }}>
            Every mile counts, and nobody crosses the finish line alone.
          </Text>
        </View>
        <View style={{ gap: Space.md, marginTop: Space.lg }}>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            editable={!sent}
          />
          {sent ? (
            <>
              <Text variant="muted" style={{ textAlign: 'center' }}>
                Check your email and tap the link on this phone to sign in.
              </Text>
              <Button title="Send it again" onPress={sendLink} loading={busy} />
              <Button title="Use a different email" variant="secondary" onPress={() => setSent(false)} />
            </>
          ) : (
            <Button title="Email me a sign-in link" onPress={sendLink} loading={busy} disabled={!email.includes('@')} />
          )}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
