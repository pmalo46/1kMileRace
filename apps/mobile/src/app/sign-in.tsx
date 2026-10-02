import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, View } from 'react-native';

import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { ProgressRing } from '@/components/progress-ring';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { supabase } from '@/lib/supabase';
import { Space } from '@/theme/tokens';

/** Passwordless: we email a 6-digit code. Apple/Google sign-in come with the dev build. */
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
    setBusy(false);
    if (error) return Alert.alert('Could not send code', error.message);
    setSent(true);
  };

  const verify = async () => {
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) Alert.alert('That code didn’t work', error.message);
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
          {sent && (
            <Field
              label="6-digit code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
            />
          )}
          {sent ? (
            <>
              <Button title="Let’s go" onPress={verify} loading={busy} disabled={code.trim().length < 6} />
              <Button title="Use a different email" variant="secondary" onPress={() => setSent(false)} />
            </>
          ) : (
            <Button title="Email me a code" onPress={sendCode} loading={busy} disabled={!email.includes('@')} />
          )}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
