import { formatMiles } from '@1k/core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useToFinishM } from '@/lib/active-race';
import { useAuth } from '@/lib/auth';
import {
  connectHealth,
  healthStatus,
  openHealthSettings,
  syncHealth,
  type HealthStatus,
  type HealthSync,
  type WorkoutOutcome,
} from '@/lib/health-connect';
import { Space } from '@/theme/tokens';

const HEALTH_CONNECT_STORE = 'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata';

/** Bring in runs and walks recorded by a watch or another fitness app. */
export default function Health() {
  const { session } = useAuth();
  const toFinishM = useToFinishM();
  const [status, setStatus] = useState<HealthStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<HealthSync | null>(null);

  useFocusEffect(
    useCallback(() => {
      healthStatus().then(setStatus);
    }, []),
  );

  const sync = async () => {
    if (!session) return;
    setBusy(true);
    try {
      setResult(await syncHealth(session.user.id, toFinishM));
    } catch (e) {
      Alert.alert('Couldn’t read your workouts', e instanceof Error ? e.message : 'Try again.');
    }
    setBusy(false);
  };

  const connect = async () => {
    setBusy(true);
    try {
      const allowed = await connectHealth();
      setStatus(allowed ? 'connected' : 'not-connected');
      if (allowed) return await sync();
    } catch (e) {
      Alert.alert('Couldn’t connect', e instanceof Error ? e.message : 'Try again.');
    }
    setBusy(false);
  };

  return (
    <Screen>
      <View style={{ gap: Space.md }}>
        <Text variant="heading" size={28}>
          Runs from your watch
        </Text>
        <Text variant="muted">
          If you record with a watch or another app, like Garmin, Fitbit or Samsung Health, 1K Miles can pick those
          runs and walks up through Health Connect. Nothing to type in.
        </Text>

        {status === 'unsupported' && (
          <Card>
            <Text variant="heading">Not available here</Text>
            <Text variant="muted">
              This needs Android with Health Connect, and a full build of the app. You can still record a run or add
              one by hand.
            </Text>
          </Card>
        )}

        {status === 'needs-install' && (
          <Card>
            <Text variant="heading">Health Connect needs setting up</Text>
            <Text variant="muted">Install or update Health Connect from the Play Store, then come back here.</Text>
          </Card>
        )}

        {status === 'not-connected' && (
          <Card>
            <Text variant="label">What 1K Miles reads</Text>
            <Text variant="muted">
              Your workouts and their distance, to count runs and walks toward your race. It never writes anything
              back, and it reads nothing else.
            </Text>
          </Card>
        )}

        {status === 'connected' && (
          <Card>
            <Text variant="label">Connected</Text>
            <Text variant="muted">
              New runs and walks from the last week are picked up when you open the app. A run you also recorded
              here counts once.
            </Text>
          </Card>
        )}

        {result && <SyncResult result={result} />}
      </View>

      <View style={{ gap: Space.sm, marginTop: Space.md }}>
        {status === 'needs-install' && (
          <Button title="Open the Play Store" onPress={() => Linking.openURL(HEALTH_CONNECT_STORE)} />
        )}
        {status === 'not-connected' && <Button title="Connect Health Connect" onPress={connect} loading={busy} />}
        {status === 'connected' && <Button title="Check for runs now" onPress={sync} loading={busy} />}
        {status === 'connected' && (
          <Pressable onPress={openHealthSettings} accessibilityRole="link" style={{ alignSelf: 'center', padding: Space.xs }}>
            <Text variant="muted" style={{ textDecorationLine: 'underline' }}>
              Manage access in Health Connect
            </Text>
          </Pressable>
        )}
        <Button title="Done" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const OUTCOMES: Record<WorkoutOutcome, string> = {
  imported: 'Added',
  'already-logged': 'Already logged',
  'seen-before': 'Checked before',
  'not-run-or-walk': 'Not a run or walk',
  'hand-entered': 'Entered by hand, so not imported',
  'no-distance': 'No distance recorded',
  'not-counted': 'Didn’t count',
  failed: 'Couldn’t upload, will retry',
};

function SyncResult({ result }: { result: HealthSync }) {
  const { seen, imported, failed } = result;
  const miles = imported.reduce((sum, a) => sum + a.distanceM, 0);
  return (
    <Card>
      <Text variant="heading">
        {imported.length > 0
          ? `Added ${imported.length} ${imported.length === 1 ? 'workout' : 'workouts'}, ${formatMiles(miles)} miles`
          : 'Nothing new to add'}
      </Text>
      {failed > 0 && <Text variant="muted">{failed} couldn’t upload just now and will be tried again.</Text>}
      {seen.length === 0 ? (
        <Text variant="muted">
          Health Connect didn’t share any workouts from the last week. If you’ve recorded one, check that the app you
          recorded it in is set to share with Health Connect.
        </Text>
      ) : (
        <>
          <Text variant="label" style={{ marginTop: Space.xs }}>
            What Health Connect shared
          </Text>
          {seen.slice(0, 8).map((w) => (
            <View key={w.id} style={{ gap: 2 }}>
              <Text>
                <Text style={{ fontWeight: '800' }}>{OUTCOMES[w.outcome]}</Text>
                {w.distanceM > 0 ? ` · ${formatMiles(w.distanceM, 2)} mi` : ''}
              </Text>
              <Text variant="muted" size={13}>
                {new Date(w.startedAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                {' · '}
                {w.app}
                {w.reason ? ` · ${w.reason}` : ''}
              </Text>
            </View>
          ))}
        </>
      )}
    </Card>
  );
}
