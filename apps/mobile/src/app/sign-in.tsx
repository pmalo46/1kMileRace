import { milestoneQuote } from '@1k/core';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';

import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { ProgressRing } from '@/components/progress-ring';
import { Quote } from '@/components/quote';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { introSeen } from '@/lib/onboarding';
import { errorMessage, supabase } from '@/lib/supabase';
import { Space } from '@/theme/tokens';

/**
 * Email and password. Email confirmation is off, so no email is ever sent.
 * Apple/Google sign-in come with the dev build.
 */
export default function SignIn() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>(params.mode === 'sign-up' ? 'sign-up' : 'sign-in');
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
    if (error) return Alert.alert(signingUp ? 'Couldn’t create account' : 'Couldn’t sign in', errorMessage(error));
    // Only happens if "Confirm email" gets switched back on in Supabase.
    if (!data.session) Alert.alert('Almost there', 'Check your email to confirm your account, then sign in.');
  };

  // First launch: the race gets explained before anyone is asked for an email.
  if (!introSeen()) return <Redirect href="/intro" />;

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
          <Quote quote={milestoneQuote(1)} align="center" size={16} />
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
            title={signingUp ? 'I have an account' : 'Create an account'}
            variant="secondary"
            onPress={() => setMode(signingUp ? 'sign-in' : 'sign-up')}
          />
          <Pressable
            onPress={() => router.push({ pathname: '/intro', params: { replay: '1' } })}
            accessibilityRole="link"
            hitSlop={8}
            style={{ alignSelf: 'center', paddingVertical: Space.sm }}>
            <Text variant="muted" style={{ fontWeight: '700' }}>
              How the race works
            </Text>
          </Pressable>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
