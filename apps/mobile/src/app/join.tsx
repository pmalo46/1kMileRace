import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Art } from '@/components/art';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { savedASpot, useInvitePreview } from '@/lib/invites';
import { afterJoining, clearPendingInvite, normalizeInviteCode } from '@/lib/onboarding';
import { supabase } from '@/lib/supabase';
import { Space } from '@/theme/tokens';

/** Join by invite code, typed in or carried by an invite link (`?code=`). */
export default function Join() {
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(params.code ?? '');
  const [busy, setBusy] = useState(false);
  const normalized = normalizeInviteCode(code);
  const preview = useInvitePreview(normalized);

  // The link has been delivered; closing this screen shouldn't bring it back on every visit to Home.
  useEffect(() => {
    if (params.code) clearPendingInvite();
  }, [params.code]);

  const join = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('join_race', { p_invite_code: normalized });
    setBusy(false);
    if (error) return Alert.alert('Couldn’t join', error.message);
    afterJoining();
  };

  return (
    <Screen>
      <Text variant="heading" size={28}>
        Join a race
      </Text>
      {preview ? (
        <Card style={{ alignItems: 'center' }}>
          <Art name="invite" size={180} />
          <Text variant="heading" style={{ textAlign: 'center' }}>
            {savedASpot(preview)}
          </Text>
          <Text variant="muted" style={{ textAlign: 'center' }}>
            {preview.member_count} {preview.member_count === 1 ? 'person' : 'people'} in so far.{' '}
            {startsLine(new Date(preview.starts_at))}
          </Text>
        </Card>
      ) : (
        <Text variant="muted">Ask whoever started the race for the code.</Text>
      )}
      <Field label="Invite code" value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} />
      <View style={{ gap: Space.sm }}>
        <Button title={preview ? 'Join them' : 'Join'} onPress={join} loading={busy} disabled={normalized.length < 4} />
      </View>
    </Screen>
  );
}

function startsLine(d: Date): string {
  const date = d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  return d.getTime() > Date.now() ? `Starts ${date}.` : `Started ${date}.`;
}
