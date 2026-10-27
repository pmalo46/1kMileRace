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
          Watch sync
        </Text>
        <Text variant="muted">Import runs from Garmin, Fitbit, Samsung Health and more via Health Connect.</Text>

        {status === 'unsupported' && (
          <Card>
            <Text variant="heading">Not available here</Text>
            <Text variant="muted">Requires Android and Health Connect.</Text>
          </Card>
        )}

        {status === 'needs-install' && (
          <Card>
            <Text variant="heading">Install Health Connect</Text>
          </Card>
        )}

        {status === 'not-connected' && <Text variant="muted">Reads workouts only. Never writes.</Text>}

        {status === 'connected' && (
          <Card>
            <Text variant="label">Connected</Text>
            <Text variant="muted">Syncs the last week each time you open the app.</Text>
          </Card>
        )}

        {result && <SyncResult result={result} />}
      </View>

      <View style={{ gap: Space.sm, marginTop: Space.md }}>
        {status === 'needs-install' && (
          <Button title="Open the Play Store" onPress={() => Linking.openURL(HEALTH_CONNECT_STORE)} />
        )}
        {status === 'not-connected' && <Button title="Connect" onPress={connect} loading={busy} />}
        {status === 'connected' && <Button title="Sync now" onPress={sync} loading={busy} />}
        {status === 'connected' && (
          <Pressable onPress={openHealthSettings} accessibilityRole="link" style={{ alignSelf: 'center', padding: Space.xs }}>
            <Text variant="muted" style={{ textDecorationLine: 'underline' }}>
              Manage access
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
  'hand-entered': 'Manual entry, skipped',
  'no-distance': 'No distance recorded',
  'not-counted': 'Didn’t count',
  failed: 'Upload failed, will retry',
};

function SyncResult({ result }: { result: HealthSync }) {
  const { seen, imported, failed } = result;
  const miles = imported.reduce((sum, a) => sum + a.distanceM, 0);
  return (
    <Card>
      <Text variant="heading">
        {imported.length > 0
          ? `Added ${imported.length} ${imported.length === 1 ? 'workout' : 'workouts'} · ${formatMiles(miles)} mi`
          : 'Nothing new'}
      </Text>
      {failed > 0 && <Text variant="muted">{failed} failed, will retry</Text>}
      {seen.length === 0 ? (
        <Text variant="muted">No workouts this week. Check your app shares with Health Connect.</Text>
      ) : (
        <>
          <Text variant="label" style={{ marginTop: Space.xs }}>
            Workouts found
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
