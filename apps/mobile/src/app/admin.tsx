import {
  LONG_HAND_ENTRY_M,
  formatDuration,
  formatMiles,
  formatPace,
  metersToMiles,
  paceSecondsPerMile,
  reviewReason,
  trackingMethodOf,
  type TrackingMethod,
} from '@1k/core';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, Share, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { Text } from '@/components/text';
import { useActiveRace } from '@/lib/active-race';
import {
  evidenceUrl,
  isOrganizer,
  postAnnouncement,
  removeMember,
  replaceInviteCode,
  reviewRun,
  setMemberRole,
  updateRaceDetails,
  useMembers,
  usePendingReviews,
  type Member,
  type PendingRun,
} from '@/lib/admin';
import { useAuth } from '@/lib/auth';
import { formatInviteCode, inviteLink } from '@/lib/onboarding';
import { forgetSharedRequests } from '@/lib/races';
import { Radius, Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

type Tab = 'review' | 'members' | 'race';

/** Organizers and marshals keep the race honest here; organizers also run the roster and the race. */
export default function Admin() {
  const { race, refresh: refreshRace } = useActiveRace();
  const organizer = isOrganizer(race);
  const [tab, setTab] = useState<Tab>('review');
  const { runs, refresh } = usePendingReviews(race);
  const [refreshing, setRefreshing] = useState(false);

  if (!race) {
    return (
      <Screen>
        <ActivityIndicator style={{ marginTop: Space.xxl }} />
      </Screen>
    );
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={{ gap: Space.xs }}>
        <Text variant="label">{race.name}</Text>
        <Text variant="heading" size={28}>
          Race admin
        </Text>
      </View>
      {organizer && (
        <Segmented
          options={[
            { value: 'review', label: runs?.length ? `Review (${runs.length})` : 'Review' },
            { value: 'members', label: 'Members' },
            { value: 'race', label: 'Race' },
          ]}
          value={tab}
          onChange={setTab}
        />
      )}
      {tab === 'review' && <ReviewQueue raceId={race.id} runs={runs} onChanged={refresh} />}
      {tab === 'members' && organizer && <Members raceId={race.id} />}
      {tab === 'race' && organizer && (
        <RaceSettings
          raceId={race.id}
          name={race.name}
          description={race.description ?? ''}
          inviteCode={race.invite_code}
          onChanged={() => {
            forgetSharedRequests();
            refreshRace();
          }}
        />
      )}
    </Screen>
  );
}

// --- Review ----------------------------------------------------------------------------

const LONG_MILES = Math.round(metersToMiles(LONG_HAND_ENTRY_M));

function ReviewQueue({
  raceId,
  runs,
  onChanged,
}: {
  raceId: string;
  runs: PendingRun[] | null;
  onChanged: () => void;
}) {
  if (!runs) return <ActivityIndicator style={{ marginTop: Space.lg }} />;
  if (runs.length === 0) {
    return (
      <Card>
        <Text variant="heading">Nothing waiting.</Text>
        <Text variant="muted">
          Runs land here when they could be miles nobody ran: too fast for feet, longer than the route, a treadmill photo
          from another time, or {LONG_MILES}+ miles added by hand. You&apos;ll get a notification when one does.
        </Text>
      </Card>
    );
  }
  return (
    <View style={{ gap: Space.md }}>
      <Text variant="muted">
        These runs count while they wait. Count it keeps them; Don&apos;t count it takes the miles back off and tells
        the runner why.
      </Text>
      {runs.map((run) => (
        <ReviewCard key={run.activity_id} raceId={raceId} run={run} onDone={onChanged} />
      ))}
    </View>
  );
}

const HOW: Record<TrackingMethod, string> = {
  app: 'Recorded in the app',
  watch: 'Synced from a watch',
  treadmill: 'Treadmill, with a photo',
  hand: 'Added by hand',
};

function ReviewCard({ raceId, run, onDone }: { raceId: string; run: PendingRun; onDone: () => void }) {
  const { colors } = useTheme();
  const [photo, setPhoto] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const path = run.evidence_paths[0];
    if (path) evidenceUrl(path).then(setPhoto);
  }, [run.evidence_paths]);

  const pace = run.time_recorded ? paceSecondsPerMile(run.distance_m, run.moving_time_s) : null;
  const when = new Date(run.started_at).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const decide = async (decision: 'approve' | 'reject') => {
    setBusy(true);
    try {
      await reviewRun(raceId, run.activity_id, decision, decision === 'reject' ? note : undefined);
      onDone();
    } catch (e) {
      Alert.alert('Couldn’t save that', e instanceof Error ? e.message : 'Try again.');
      setBusy(false);
    }
  };

  return (
    <Card>
      <Text variant="label">
        {run.display_name} · {when}
      </Text>
      <Text variant="heading">
        {formatMiles(run.distance_m)} mi {run.type}
        {pace != null ? ` · ${formatPace(pace)} /mi` : ''}
      </Text>
      <Text variant="muted">
        {HOW[trackingMethodOf(run.source)]}
        {run.time_recorded ? ` · ${formatDuration(run.moving_time_s)}` : ' · Time not recorded'}
        {run.usual_pace_s != null ? ` · Usually ${formatPace(run.usual_pace_s)} /mi` : ''}
      </Text>
      <Text style={{ fontWeight: '700' }}>{reviewReason(run.flags)}</Text>
      {photo && (
        <Image
          source={{ uri: photo }}
          style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: Radius.md, backgroundColor: colors.surfaceAlt }}
          contentFit="cover"
          accessibilityLabel={`Treadmill photo from ${run.display_name}`}
        />
      )}
      {rejecting ? (
        <View style={{ gap: Space.sm }}>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Why it doesn't count (they'll see this)"
            placeholderTextColor={colors.textMuted}
            maxLength={500}
            multiline
            autoFocus
            accessibilityLabel="Note to the runner"
            style={{
              minHeight: 64,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: Radius.md,
              padding: Space.sm,
              fontSize: 16,
              color: colors.text,
            }}
          />
          <View style={{ flexDirection: 'row', gap: Space.sm }}>
            <View style={{ flex: 1 }}>
              <Button title="Back" variant="secondary" onPress={() => setRejecting(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Don't count it" onPress={() => decide('reject')} loading={busy} />
            </View>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: Space.sm }}>
          <View style={{ flex: 1 }}>
            <Button title="Don't count it" variant="secondary" onPress={() => setRejecting(true)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Count it" onPress={() => decide('approve')} loading={busy} />
          </View>
        </View>
      )}
    </Card>
  );
}

// --- Members ---------------------------------------------------------------------------

const ROLE_LABEL: Record<Member['role'], string> = {
  organizer: 'Organizer',
  marshal: 'Marshal: reviews runs',
  participant: 'Runner',
  supporter: 'Supporter',
};

function Members({ raceId }: { raceId: string }) {
  const { session } = useAuth();
  const { members, refresh } = useMembers(raceId);
  const [busy, setBusy] = useState<string | null>(null);
  if (!members) return <ActivityIndicator style={{ marginTop: Space.lg }} />;

  const act = async (userId: string, work: () => Promise<unknown>) => {
    setBusy(userId);
    try {
      await work();
      await refresh();
    } catch (e) {
      Alert.alert('Couldn’t change that', e instanceof Error ? e.message : 'Try again.');
    }
    setBusy(null);
  };

  const confirmRemove = (m: Member) =>
    Alert.alert(
      `Remove ${m.profile?.display_name ?? 'this runner'}?`,
      'Their miles come off the leaderboard and they can’t rejoin with the invite code.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => act(m.user_id, () => removeMember(raceId, m.user_id)) },
      ],
    );

  return (
    <View style={{ gap: Space.sm }}>
      <Text variant="muted">
        Marshals can review runs alongside you. Organizers can&apos;t be changed here, and neither can you.
      </Text>
      {members.map((m) => {
        const editable = m.user_id !== session?.user.id && (m.role === 'participant' || m.role === 'marshal');
        return (
          <Card key={m.user_id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800' }}>
                  {m.profile?.display_name ?? 'Runner'}
                  {m.user_id === session?.user.id ? ' (you)' : ''}
                </Text>
                <Text variant="muted" size={14}>
                  {ROLE_LABEL[m.role]}
                </Text>
              </View>
              {busy === m.user_id && <ActivityIndicator />}
            </View>
            {editable && (
              <View style={{ flexDirection: 'row', gap: Space.sm }}>
                <View style={{ flex: 1 }}>
                  <Button
                    title={m.role === 'marshal' ? 'Make runner' : 'Make marshal'}
                    variant="secondary"
                    onPress={() =>
                      act(m.user_id, () =>
                        setMemberRole(raceId, m.user_id, m.role === 'marshal' ? 'participant' : 'marshal'),
                      )
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title="Remove" variant="secondary" onPress={() => confirmRemove(m)} />
                </View>
              </View>
            )}
          </Card>
        );
      })}
    </View>
  );
}

// --- Race ------------------------------------------------------------------------------

function RaceSettings({
  raceId,
  name: savedName,
  description: savedDescription,
  inviteCode,
  onChanged,
}: {
  raceId: string;
  name: string;
  description: string;
  inviteCode: string;
  onChanged: () => void;
}) {
  const [name, setName] = useState(savedName);
  const [description, setDescription] = useState(savedDescription);
  const [code, setCode] = useState(inviteCode);
  const [announcement, setAnnouncement] = useState('');
  const [busy, setBusy] = useState<'details' | 'code' | 'announce' | null>(null);
  const changed = name.trim() !== savedName || description.trim() !== savedDescription;

  const run = async (what: NonNullable<typeof busy>, work: () => Promise<void>) => {
    setBusy(what);
    try {
      await work();
    } catch (e) {
      Alert.alert('Couldn’t save that', e instanceof Error ? e.message : 'Try again.');
    }
    setBusy(null);
  };

  const saveDetails = () =>
    run('details', async () => {
      await updateRaceDetails(raceId, name, description);
      onChanged();
    });

  const confirmReplace = () =>
    Alert.alert(
      'Replace the invite code?',
      'Links and codes you’ve already shared stop working. Everyone already in stays in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: () =>
            run('code', async () => {
              setCode(await replaceInviteCode(raceId));
              onChanged();
            }),
        },
      ],
    );

  const announce = () =>
    run('announce', async () => {
      await postAnnouncement(raceId, announcement.trim());
      setAnnouncement('');
      Alert.alert('Sent', 'Everyone in the race got it, and it’s pinned at the top of Feed and Chat.');
    });

  return (
    <View style={{ gap: Space.md }}>
      <Card>
        <Text variant="label">Announcement</Text>
        <Text variant="muted">Pinned at the top of Feed and Chat, and sent to everyone in the race.</Text>
        <Field
          label="Message"
          value={announcement}
          onChangeText={setAnnouncement}
          placeholder="Group run Saturday, 8am at the park."
          multiline
          maxLength={2000}
          style={{ minHeight: 88, textAlignVertical: 'top', paddingTop: Space.sm }}
        />
        <Button
          title="Send to everyone"
          onPress={announce}
          loading={busy === 'announce'}
          disabled={!announcement.trim()}
        />
      </Card>

      <Card>
        <Text variant="label">Invite code</Text>
        <Text variant="display" size={32}>
          {formatInviteCode(code)}
        </Text>
        <View style={{ flexDirection: 'row', gap: Space.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              title="Share"
              variant="secondary"
              onPress={() =>
                Share.share({
                  message: `Join ${savedName} on 1K Mile Race.\n${inviteLink(code)}\nOr use the code ${formatInviteCode(code)}`,
                }).catch(() => undefined)
              }
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Replace code" variant="secondary" onPress={confirmReplace} loading={busy === 'code'} />
          </View>
        </View>
      </Card>

      <Card>
        <Text variant="label">Race details</Text>
        <Field label="Name" value={name} onChangeText={setName} maxLength={80} />
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="What this group is about, where you run, anything new people should know."
          multiline
          maxLength={2000}
          style={{ minHeight: 88, textAlignVertical: 'top', paddingTop: Space.sm }}
        />
        <Text variant="muted" size={14}>
          The start date and the 1,000-mile goal stay as the race was set up, so nobody&apos;s standing shifts under
          them.
        </Text>
        <Button title="Save" onPress={saveDetails} loading={busy === 'details'} disabled={!changed || !name.trim()} />
      </Card>
    </View>
  );
}
