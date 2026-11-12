import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Art } from '@/components/art';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { hasNotificationPermission, registerForPush } from '@/lib/notifications';
import { markPushAsked } from '@/lib/onboarding';
import { Space } from '@/theme/tokens';

/** Asked once, right after joining a race, so the system prompt arrives with a reason attached. */
export default function Nudges() {
  const [busy, setBusy] = useState(false);

  // Someone who already allowed notifications has nothing to answer.
  useEffect(() => {
    hasNotificationPermission().then((granted) => {
      if (!granted) return;
      markPushAsked();
      registerForPush();
      router.back();
    });
  }, []);

  const answer = async (turnOn: boolean) => {
    markPushAsked();
    if (turnOn) {
      setBusy(true);
      await registerForPush({ ask: true });
      setBusy(false);
    }
    router.back();
  };

  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: Space.md, marginTop: Space.lg }}>
        <Art name="invite" size={220} />
        <Text variant="heading" size={28} style={{ textAlign: 'center' }}>
          Be there for it.
        </Text>
        <Text size={18} style={{ textAlign: 'center', lineHeight: 25 }}>
          When someone in your race hits a milestone, you&apos;ll want to know. When they cheer your run, you&apos;ll
          want to hear it.
        </Text>
      </View>
      <View style={{ gap: Space.sm, marginTop: Space.lg }}>
        <Button title="Turn on notifications" onPress={() => answer(true)} loading={busy} />
        <Button title="Not now" variant="secondary" onPress={() => answer(false)} />
      </View>
    </Screen>
  );
}
