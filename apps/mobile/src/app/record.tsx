import {
  DEFAULT_RACE_RULES,
  formatDuration,
  formatMiles,
  formatPace,
  MAX_ACCURACY_M,
  paceSecondsPerMile,
  summarizeTrack,
  type TrackPoint,
} from '@1k/core';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Logged } from '@/components/logged';
import { RouteSketch } from '@/components/route-sketch';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { Text } from '@/components/text';
import { LogError, type LogResult } from '@/lib/activities';
import { useAuth } from '@/lib/auth';
import {
  activeMs,
  currentRecording,
  discardRecording,
  finishRecording,
  getRecording,
  inExpoGo,
  pauseRecording,
  reattachRecording,
  recordingPoints,
  resumeRecording,
  startRecording,
  uploadRecording,
  type Recording,
  type TrackingMode,
} from '@/lib/recorder';
import { Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const KEEP_AWAKE_TAG = 'recording';

/** Record a run or walk with GPS: the main way miles get logged. */
export default function Record() {
  const { session } = useAuth();
  const [type, setType] = useState<Recording['type']>('run');
  const [rec, setRec] = useState<Recording | null>(() => currentRecording());
  const [mode, setMode] = useState<TrackingMode | null>(null);
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ result: LogResult; miles: string }>();

  // Picking up a run that was going when the app closed.
  useEffect(() => {
    const open = currentRecording();
    if (open?.state === 'recording') reattachRecording(open).then((m) => m && setMode(m));
  }, []);

  // Recordings live in SQLite (the background task writes there), so poll it once a second.
  useEffect(() => {
    if (!rec) return;
    const tick = () => {
      setPoints(recordingPoints(rec.id));
      setRec(getRecording(rec.id));
      setNow(Date.now());
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [rec?.id]);

  // Expo Go can only track while the screen is on, so keep it on.
  const recording = rec?.state === 'recording';
  useEffect(() => {
    if (!(recording && mode === 'foreground')) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    };
  }, [recording, mode]);

  const summary = useMemo(() => summarizeTrack(points), [points]);

  const start = async () => {
    setBusy(true);
    const started = await startRecording(type);
    setBusy(false);
    if (!started) {
      return Alert.alert('Location needed', 'Recording measures your run with GPS. Allow location access to start.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRec(started.recording);
    setMode(started.mode);
  };

  const pause = async () => {
    if (!rec) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await pauseRecording(rec.id);
    setRec(getRecording(rec.id));
  };

  const resume = async () => {
    if (!rec) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMode(await resumeRecording(rec.id));
    setRec(getRecording(rec.id));
  };

  const discard = () =>
    Alert.alert('Discard this run?', 'It won’t be saved anywhere.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          if (rec) await discardRecording(rec.id);
          router.back();
        },
      },
    ]);

  const upload = async (id: string) => {
    if (!session) return;
    setBusy(true);
    try {
      const res = await uploadRecording(session.user.id, id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (res === 'already-saved') router.back();
      else setSaved({ result: res, miles: formatMiles(summary.distanceM, 2) });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (e instanceof LogError && e.status === 422) {
        Alert.alert('This run didn’t count', message, [{ text: 'OK', onPress: () => router.back() }]);
      } else {
        setQueued(message);
      }
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    if (!rec) return;
    const short = summary.distanceM < DEFAULT_RACE_RULES.minDistanceM;
    if (short) {
      return Alert.alert(
        'So close!',
        `Runs need at least 1 mile to count, and you’re at ${formatMiles(summary.distanceM, 2)}. Keep going?`,
        [
          { text: 'Keep going', style: 'cancel', onPress: () => rec.state === 'paused' && resume() },
          { text: 'Discard run', style: 'destructive', onPress: discard },
        ],
      );
    }
    Alert.alert('Finish your run?', `${formatMiles(summary.distanceM, 2)} miles in ${formatDuration(activeMs(rec) / 1000)}`, [
      { text: 'Not yet', style: 'cancel' },
      {
        text: 'Finish',
        onPress: async () => {
          await finishRecording(rec.id);
          setRec(getRecording(rec.id));
          await upload(rec.id);
        },
      },
    ]);
  };

  if (saved) return <Logged result={saved.result} miles={saved.miles} />;
  if (queued && rec) return <Queued message={queued} busy={busy} onRetry={() => upload(rec.id)} />;
  if (!rec) return <Ready type={type} onType={setType} onStart={start} busy={busy} />;

  return (
    <Active
      rec={rec}
      points={points}
      distanceM={summary.distanceM}
      movingTimeS={summary.movingTimeS}
      timerMs={activeMs(rec, now)}
      busy={busy}
      onPause={pause}
      onResume={resume}
      onFinish={finish}
      onDiscard={discard}
    />
  );
}

function Ready({
  type,
  onType,
  onStart,
  busy,
}: {
  type: Recording['type'];
  onType: (t: Recording['type']) => void;
  onStart: () => void;
  busy: boolean;
}) {
  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, gap: Space.md }}>
        <Text variant="heading" size={28}>
          Ready when you are
        </Text>
        <Segmented
          options={[
            { value: 'run', label: 'Run' },
            { value: 'walk', label: 'Walk' },
          ]}
          value={type}
          onChange={onType}
        />
        <Card>
          <Text variant="label">How it works</Text>
          <Text variant="muted">
            Your phone measures distance and pace with GPS. Recorded runs are the ones everyone can trust, so they’re
            the best way to log.
          </Text>
          <Text variant="muted">
            {inExpoGo
              ? 'Testing in Expo Go: keep the app open and the screen on while you record.'
              : 'It keeps recording with your screen locked. A notification shows while it’s on.'}
          </Text>
        </Card>
      </View>
      <View style={{ gap: Space.sm }}>
        <Button title={`Start ${type}`} onPress={onStart} loading={busy} />
        <Button title="Cancel" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

function Active(props: {
  rec: Recording;
  points: TrackPoint[];
  distanceM: number;
  movingTimeS: number;
  timerMs: number;
  busy: boolean;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onDiscard: () => void;
}) {
  const { colors } = useTheme();
  const { rec, points, distanceM, movingTimeS } = props;
  const paused = rec.state === 'paused';
  const lastFix = points.at(-1);
  const weakSignal = !paused && (!lastFix || (lastFix.acc ?? 0) > MAX_ACCURACY_M || Date.now() - lastFix.t > 15_000);

  return (
    <Screen scroll={false}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="label">{rec.type === 'run' ? 'Run' : 'Walk'}</Text>
        <Text variant="label" style={{ color: paused ? colors.behindPace : colors.onPace }}>
          {paused ? 'Paused' : 'Recording'}
        </Text>
      </View>

      {rec.mocked === 1 && (
        <Text style={{ color: colors.danger, fontWeight: '700' }}>
          A fake-location app is active, so this run won’t count.
        </Text>
      )}

      <View style={{ alignItems: 'center', gap: Space.xs }}>
        <Text variant="display" size={72}>
          {formatMiles(distanceM, 2)}
        </Text>
        <Text variant="label">miles</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: Space.sm }}>
        <Stat label="Time" value={formatDuration(props.timerMs / 1000)} />
        <Stat label="Avg pace" value={distanceM > 50 ? formatPace(paceSecondsPerMile(distanceM, movingTimeS)) : '–'} />
      </View>

      {points.length >= 2 ? (
        <RouteSketch points={points} height={200} />
      ) : (
        <Card style={{ height: 200, justifyContent: 'center', alignItems: 'center' }}>
          <Text variant="muted">Finding you on the map…</Text>
        </Card>
      )}
      {weakSignal && points.length > 0 && <Text variant="muted">Weak GPS signal. Head somewhere with open sky.</Text>}

      <View style={{ flex: 1 }} />
      {paused ? (
        <View style={{ gap: Space.sm }}>
          <Button title="Resume" onPress={props.onResume} />
          <Button title="Finish" variant="secondary" onPress={props.onFinish} loading={props.busy} />
          <Pressable onPress={props.onDiscard} accessibilityRole="button" style={{ alignSelf: 'center', padding: Space.sm }}>
            <Text variant="muted">Discard run</Text>
          </Pressable>
        </View>
      ) : (
        <Button title="Pause" onPress={props.onPause} />
      )}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flex: 1, alignItems: 'center' }}>
      <Text variant="display" size={28}>
        {value}
      </Text>
      <Text variant="label">{label}</Text>
    </Card>
  );
}

function Queued({ message, busy, onRetry }: { message: string; busy: boolean; onRetry: () => void }) {
  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, justifyContent: 'center', gap: Space.md }}>
        <Text variant="heading" size={28}>
          Saved on your phone
        </Text>
        <Text variant="muted">
          It couldn’t upload just now ({message}). It’s safe here and will upload the next time you open the app.
        </Text>
      </View>
      <View style={{ gap: Space.sm }}>
        <Button title="Try again" onPress={onRetry} loading={busy} />
        <Button title="Done" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
