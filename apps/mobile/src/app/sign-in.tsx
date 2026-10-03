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
 * Email and password. Email confirmation is off, so no email is ever sent.
 * Apple/Google sign-in come with the dev build.
 */
export default function SignIn() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const signingUp = mode === 'sign-up';

  const submit = async () => {
    setBusy(true);
    const credentials = { email: email.trim(), password };
    const { data, error } = signingUp
      ? await supabase.auth.signUp({ ...credentials, options: { data: { display_name: name.trim() } } })
      : await supabase.auth.signInWithPassword(credentials);
    setBusy(false);
    if (error) return Alert.alert(signingUp ? 'Could not create your account' : 'Could not sign you in', error.message);
    // Only happens if "Confirm email" gets switched back on in Supabase.
    if (!data.session) Alert.alert('Almost there', 'Check your email to confirm your account, then sign in.');
  };

  const ready = email.includes('@') && password.length >= 6 && (!signingUp || name.trim().length > 0);

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
          {signingUp && (
            <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" placeholder="Alex" />
          )}
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={signingUp ? 'new-password' : 'current-password'}
            placeholder="At least 6 characters"
          />
          <Button
            title={signingUp ? 'Create account' : 'Sign in'}
            onPress={submit}
            loading={busy}
            disabled={!ready}
          />
          <Button
            title={signingUp ? 'I already have an account' : 'New here? Create an account'}
            variant="secondary"
            onPress={() => setMode(signingUp ? 'sign-in' : 'sign-up')}
          />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
