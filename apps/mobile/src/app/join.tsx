import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { supabase } from '@/lib/supabase';

export default function Join() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const join = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('join_race', { p_invite_code: code.trim().toLowerCase() });
    setBusy(false);
    if (error) return Alert.alert('Couldn’t join', error.message);
    router.back();
  };

  return (
    <Screen>
      <Text variant="heading" size={28}>
        Join a race
      </Text>
      <Text variant="muted">Enter the invite code your organizer shared with you.</Text>
      <Field label="Invite code" value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} />
      <Button title="Join" onPress={join} loading={busy} disabled={code.trim().length < 4} />
    </Screen>
  );
}
