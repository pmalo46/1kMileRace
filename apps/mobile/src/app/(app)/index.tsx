import {
  METERS_PER_MILE,
  MILESTONE_MILES,
  distanceBoard,
  formatMiles,
  formatPace,
  metersToMiles,
  milestoneQuote,
  nextMilestone,
  paceSecondsPerMile,
  paceStatus,
  quoteOfTheDay,
  rivalAhead,
} from '@1k/core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { MileWall } from '@/components/mile-wall';
import { ProgressRing } from '@/components/progress-ring';
import { Quote } from '@/components/quote';
import { Screen } from '@/components/screen';
import { SinceLastLookTeaser } from '@/components/since-last-look';
import { Text } from '@/components/text';
import { WeekStrip } from '@/components/week-strip';
import { useActiveRace, useToFinishM } from '@/lib/active-race';
import { useAuth } from '@/lib/auth';
import { greeting } from '@/lib/greeting';
import { healthStatus, syncHealth } from '@/lib/health-connect';
import { useSinceLastLook } from '@/lib/last-look';
import { useMyWeek } from '@/lib/momentum';
import { useStandings } from '@/lib/races';
import { currentRecording, unsyncedRecordings, uploadRecording } from '@/lib/recorder';
import { Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export default function Home() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const { race, loaded, refresh: refreshRaces } = useActiveRace();
  const { standings, refresh: refreshStandings } = useStandings(race?.id);
  const { week, refresh: refreshWeek } = useMyWeek(session?.user.id);
  const [refreshing, setRefreshing] = useState(false);
  // Home only peeks: the leaderboard is where the race has been seen.
  const { recap } = useSinceLastLook(race?.id, session?.user.id, standings, race?.goal_m ?? 1, { record: false });

  const me = standings?.find((s) => s.user_id === session?.user.id);
  const board = useMemo(() => (standings ? distanceBoard(standings) : []), [standings]);
  const myPlace = board.find((r) => r.standing.user_id === session?.user.id)?.place;
  const finishers = board.filter((r) => r.finished).length;
  const combinedM = standings?.reduce((sum, s) => sum + s.total_distance_m, 0) ?? 0;

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshRaces(), refreshStandings(), refreshWeek()]);
    setRefreshing(false);
  };

  if (loaded && !race) return <NoRaceYet />;

  const goalM = race?.goal_m ?? 1;
  const countedM = me?.counted_distance_m ?? 0;
  const pace = race
    ? paceStatus(countedM, { startsAt: new Date(race.starts_at), endsAt: new Date(race.ends_at), goalM })
    : null;
  const name = me?.profile?.display_name ?? '';
  const goalMiles = Math.round(metersToMiles(goalM));
  const progress = Math.min(1, countedM / goalM) * 100;
  // Under 10% a whole number barely moves, so show a decimal until it does.
  const percent = progress < 10 ? (Math.floor(progress * 10) / 10).toFixed(1) : String(Math.floor(progress));
  const next = nextMilestone(countedM, goalM);
  const rival = standings && session ? rivalAhead(standings, session.user.id) : null;
  const typicalRunM = me?.activity_count ? me.total_distance_m / me.activity_count : 0;
  const milestones = MILESTONE_MILES.filter((m) => m <= goalMiles);
  const reached = milestones.filter((m) => m * METERS_PER_MILE <= countedM + 0.5).length;

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={{ gap: Space.xs }}>
        <Text variant="label">{race?.name ?? ' '}</Text>
        <Text variant="heading" size={28}>
          {greeting()}
          {name ? `, ${name}` : ''}
        </Text>
      </View>

      <Quote quote={quoteOfTheDay()} />

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <Text variant="display">{formatMiles(countedM)}</Text>
            <Text variant="muted">of {goalMiles.toLocaleString()} miles</Text>
          </View>
          <Text variant="display" size={22} style={{ color: colors.accent }}>
            {percent}%
          </Text>
        </View>
        <MileWall goalMiles={goalMiles} filledMiles={metersToMiles(countedM)} milestones={milestones} />
        <Text variant="muted">
          {next
            ? `${formatMiles(next.toGoM)} mi to the ${next.miles.toLocaleString()}-mile milestone · ${reached} of ${milestones.length} reached`
            : `All ${milestones.length} milestones reached`}
        </Text>
      </Card>

      <RecordingStatus />
      <WatchRuns onImported={refreshStandings} />
      {recap && <SinceLastLookTeaser recap={recap} me={me} />}

      {pace && (
        <Card style={!pace.finished && week && !week.ranToday ? { borderColor: colors.accent, borderWidth: 2 } : undefined}>
          {pace.finished ? (
            <>
              <Text variant="heading">You finished 🏁</Text>
              <Quote quote={milestoneQuote(goalMiles)} size={16} />
            </>
          ) : (
            <>
              <Text variant="label">Today</Text>
              <Text variant="heading">{week?.ranToday ? 'Done for today ✓' : 'Nothing logged yet today'}</Text>
              <Text variant="muted" style={{ color: pace.aheadByM >= 0 ? colors.onPace : colors.behindPace }}>
                {pace.aheadByM >= 0
                  ? `${formatMiles(pace.aheadByM)} mi ahead of pace`
                  : Number.isFinite(pace.requiredDailyM)
                    ? `${metersToMiles(pace.requiredDailyM).toFixed(1)} mi/day to finish · ${Math.ceil(pace.daysRemaining)} days left`
                    : 'Every mile counts'}
              </Text>
            </>
          )}
        </Card>
      )}

      <Button title="Start a run" onPress={() => router.push('/record')} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: Space.lg }}>
        <Pressable onPress={() => router.push('/log-run')} accessibilityRole="link" style={{ padding: Space.xs }}>
          <Text variant="muted" style={{ textDecorationLine: 'underline' }}>
            Log manually
          </Text>
        </Pressable>
        <Pressable onPress={() => router.push('/health')} accessibilityRole="link" style={{ padding: Space.xs }}>
          <Text variant="muted" style={{ textDecorationLine: 'underline' }}>
            Sync watch
          </Text>
        </Pressable>
      </View>

      {week && (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="label">This week</Text>
            <Text variant="muted" size={13}>
              {week.days} {week.days === 1 ? 'day' : 'days'} · {formatMiles(week.distanceM)} mi
            </Text>
          </View>
          <WeekStrip ran={week.ran} today={week.today} />
        </Card>
      )}

      {rival && (
        <Pressable onPress={() => router.push('/leaderboard')} accessibilityRole="link">
          <Card>
            <Text variant="label">Up ahead</Text>
            <Text variant="heading">
              {formatMiles(rival.gapM)} mi behind {rival.standing.profile?.display_name ?? 'the next runner'}
            </Text>
            {typicalRunM > 0 && rival.gapM <= typicalRunM && <Text variant="muted">One run closes the gap</Text>}
          </Card>
        </Pressable>
      )}

      <View style={{ flexDirection: 'row', gap: Space.sm }}>
        <Stat label="Place" value={myPlace ? `#${myPlace}` : '–'} />
        <Stat label="Runs" value={String(me?.activity_count ?? 0)} />
        <Stat
          label="Avg pace"
          value={me?.counted_distance_m ? formatPace(paceSecondsPerMile(me.counted_distance_m, me.counted_moving_time_s)) : '–'}
        />
      </View>

      <Card>
        <Text variant="label">Together</Text>
        <Text variant="heading">
          {finishers} of {standings?.length ?? 0} finished
        </Text>
        <Text variant="muted">{formatMiles(combinedM, 0)} miles run together</Text>
      </Card>

      {race && (
        <Card>
          <Text variant="label">Invite code</Text>
          <Text variant="display" size={32} selectable>
            {race.invite_code}
          </Text>
          <Text variant="muted">Share it so friends can join.</Text>
        </Card>
      )}
    </Screen>
  );
}

/** A run still going (e.g. the app was closed mid-run) or recorded runs waiting to upload. */
function RecordingStatus() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const [open, setOpen] = useState(currentRecording);
  const [waiting, setWaiting] = useState(() => unsyncedRecordings().length);
  const [uploading, setUploading] = useState(false);

  const uploadAll = useCallback(async () => {
    if (!session) return;
    setUploading(true);
    for (const r of unsyncedRecordings()) {
      // Failures stay queued for next time; rejections drop out of the queue.
      await uploadRecording(session.user.id, r.id).catch(() => undefined);
    }
    setWaiting(unsyncedRecordings().length);
    setUploading(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      setOpen(currentRecording());
      if (unsyncedRecordings().length > 0) uploadAll();
      else setWaiting(0);
    }, [uploadAll]),
  );

  if (open) {
    return (
      <Card style={{ borderColor: colors.accent, borderWidth: 2 }}>
        <Text variant="heading">Your {open.type} is {open.state === 'paused' ? 'paused' : 'still recording'}</Text>
        <Button title="Back to it" onPress={() => router.push('/record')} />
      </Card>
    );
  }
  if (waiting > 0) {
    return (
      <Card>
        <Text variant="heading">
          {waiting} recorded {waiting === 1 ? 'run' : 'runs'} waiting to upload
        </Text>
        <Button title="Upload now" variant="secondary" onPress={uploadAll} loading={uploading} />
      </Card>
    );
  }
  return null;
}

/** How often opening Home goes looking for new watch runs. */
const WATCH_SYNC_EVERY_MS = 10 * 60 * 1000;
let lastWatchSync = 0;

/** Quietly picks up new runs from Health Connect when Home opens, and says so when it finds some. */
function WatchRuns({ onImported }: { onImported: () => void }) {
  const { session } = useAuth();
  const toFinishM = useToFinishM();
  const [added, setAdded] = useState<{ count: number; miles: string } | null>(null);
  const userId = session?.user.id;

  useFocusEffect(
    useCallback(() => {
      if (!userId || Date.now() - lastWatchSync < WATCH_SYNC_EVERY_MS) return;
      lastWatchSync = Date.now();
      (async () => {
        if ((await healthStatus()) !== 'connected') return;
        const { imported } = await syncHealth(userId, toFinishM);
        if (imported.length === 0) return;
        setAdded({
          count: imported.length,
          miles: formatMiles(imported.reduce((sum, a) => sum + a.distanceM, 0)),
        });
        onImported();
      })().catch(() => undefined);
      // toFinishM only loosens the rules for a finishing run; a stale value just defers to the server.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]),
  );

  if (!added) return null;
  return (
    <Card>
      <Text variant="heading">
        Synced {added.count} {added.count === 1 ? 'workout' : 'workouts'} · {added.miles} mi
      </Text>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flex: 1, alignItems: 'center' }}>
      <Text variant="display" size={26}>
        {value}
      </Text>
      <Text variant="label">{label}</Text>
    </Card>
  );
}

function NoRaceYet() {
  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: Space.md, marginTop: Space.xxl }}>
        <ProgressRing progress={0} size={180} stroke={16}>
          <Text variant="display" size={40}>
            0
          </Text>
        </ProgressRing>
        <Text variant="heading" size={28} style={{ textAlign: 'center' }}>
          Your 1,000 miles start here
        </Text>
        <Quote quote={milestoneQuote(1)} align="center" />
      </View>
      <View style={{ gap: Space.sm, marginTop: Space.lg }}>
        <Button title="Join a race" onPress={() => router.push('/join')} />
        <Button title="Start a race" variant="secondary" onPress={() => router.push('/create-race')} />
      </View>
    </Screen>
  );
}
