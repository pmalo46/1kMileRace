import {
  ActivityInput,
  DEFAULT_RACE_RULES,
  evaluateActivity,
  formatMiles,
  formatPace,
  milesToMeters,
  paceSecondsPerMile,
  SECONDS_PER_DAY,
} from '@1k/core';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DateTimeField } from '@/components/date-time-field';
import { Field } from '@/components/field';
import { Logged } from '@/components/logged';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { Text } from '@/components/text';
import { logActivity, photoTakenAt, type ActivityDraft, type LogResult } from '@/lib/activities';
import { useAuth } from '@/lib/auth';
import { Radius, Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

type Kind = 'run' | 'walk';
type Where = 'outdoor' | 'treadmill';

const num = (s: string) => (s.trim() === '' ? 0 : Number(s.replace(',', '.')));

/** Add a run or walk by hand: the fallback to recording. Treadmill runs need a photo of the console. */
export default function LogRun() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const [kind, setKind] = useState<Kind>('run');
  const [where, setWhere] = useState<Where>('outdoor');
  const [miles, setMiles] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [seconds, setSeconds] = useState('');
  const [finishedAt, setFinishedAt] = useState(() => new Date());
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LogResult>();

  const now = new Date();
  const earliest = new Date(now.getTime() - DEFAULT_RACE_RULES.lateLogDays * SECONDS_PER_DAY * 1000);
  const durationS = Math.round(num(hours) * 3600 + num(minutes) * 60 + num(seconds));
  const distanceM = milesToMeters(num(miles));
  const treadmill = where === 'treadmill';
  const takenAt = photo ? photoTakenAt(photo) : undefined;

  const draft: ActivityDraft | null =
    distanceM > 0 && durationS > 0 && Number.isFinite(distanceM + durationS)
      ? {
          source: treadmill ? 'treadmill_manual' : 'manual',
          type: kind,
          environment: where,
          startedAt: new Date(finishedAt.getTime() - durationS * 1000).toISOString(),
          endedAt: finishedAt.toISOString(),
          distanceM,
          movingTimeS: durationS,
          elapsedTimeS: durationS,
          evidenceCount: treadmill && photo ? 1 : 0,
          evidenceTakenAt: treadmill ? takenAt?.toISOString() : undefined,
        }
      : null;

  // Same rules the server applies, for instant feedback. The server's verdict is final.
  const evaluation = useMemo(() => {
    if (!draft) return null;
    const parsed = ActivityInput.safeParse(draft);
    return parsed.success ? evaluateActivity(parsed.data, DEFAULT_RACE_RULES) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(draft)]);
  const blockers = evaluation?.issues.filter((i) => i.severity === 'reject') ?? [];
  const notes = evaluation?.issues.filter((i) => i.severity === 'flag') ?? [];

  const pickPhoto = async (camera: boolean) => {
    if (camera) {
      const { granted } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) return Alert.alert('Camera access needed', 'Allow camera access in Settings, or choose a photo instead.');
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, exif: true };
    const res = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (!res.canceled && res.assets[0]) setPhoto(res.assets[0]);
  };

  const submit = async () => {
    if (!draft || !session) return;
    setBusy(true);
    try {
      const res = await logActivity(session.user.id, draft, treadmill ? photo : undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResult(res);
    } catch (e) {
      Alert.alert('That didn’t save', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (result) return <Logged result={result} miles={String(num(miles))} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Text variant="heading" size={28}>
          Add a {kind} by hand
        </Text>
        <Text variant="muted">
          Recording with GPS is the best way to log. Runs added by hand are marked as entered by hand, and organizers
          may review them.
        </Text>
        <Segmented
          options={[
            { value: 'run', label: 'Run' },
            { value: 'walk', label: 'Walk' },
          ]}
          value={kind}
          onChange={setKind}
        />
        <Segmented
          options={[
            { value: 'outdoor', label: 'Outdoors' },
            { value: 'treadmill', label: 'Treadmill' },
          ]}
          value={where}
          onChange={setWhere}
        />

        <Field label="Distance (miles)" value={miles} onChangeText={setMiles} keyboardType="decimal-pad" placeholder="3.1" />
        <View style={{ flexDirection: 'row', gap: Space.sm }}>
          {(
            [
              ['Hours', hours, setHours, '0'],
              ['Minutes', minutes, setMinutes, '30'],
              ['Seconds', seconds, setSeconds, '00'],
            ] as const
          ).map(([label, value, set, placeholder]) => (
            <View key={label} style={{ flex: 1 }}>
              <Field label={label} value={value} onChangeText={set} keyboardType="number-pad" placeholder={placeholder} maxLength={3} />
            </View>
          ))}
        </View>
        <DateTimeField
          label="Finished"
          value={finishedAt}
          onChange={setFinishedAt}
          minimumDate={earliest}
          maximumDate={now}
        />

        {treadmill && (
          <Card>
            <Text variant="label">Treadmill photo</Text>
            <Text variant="muted">Snap the console showing your distance and time. Organizers can see it; other runners can’t.</Text>
            {photo && (
              <Image
                source={{ uri: photo.uri }}
                style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: Radius.md }}
                contentFit="cover"
              />
            )}
            <View style={{ flexDirection: 'row', gap: Space.sm }}>
              <View style={{ flex: 1 }}>
                <Button title={photo ? 'Retake' : 'Take photo'} variant="secondary" onPress={() => pickPhoto(true)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Choose photo" variant="secondary" onPress={() => pickPhoto(false)} />
              </View>
            </View>
          </Card>
        )}

        {draft && (
          <View style={{ gap: Space.xs }}>
            <Text variant="muted">
              {formatPace(paceSecondsPerMile(distanceM, durationS))} /mi pace
            </Text>
            {blockers.map((i) => (
              <Text key={i.code} style={{ color: colors.danger, fontWeight: '700' }}>
                {i.message}
              </Text>
            ))}
            {blockers.length === 0 &&
              notes.map((i) => (
                <Text key={i.code} variant="muted">
                  {i.message}
                </Text>
              ))}
          </View>
        )}

        <Button
          title={draft ? `Add ${formatMiles(distanceM, 2)} miles` : 'Add miles'}
          onPress={submit}
          loading={busy}
          disabled={!draft || blockers.length > 0}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}
