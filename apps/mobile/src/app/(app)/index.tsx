import {
  MILESTONE_MILES,
  distanceBoard,
  finishPlan,
  formatMiles,
  formatPace,
  metersToMiles,
  milestoneQuote,
  paceSecondsPerMile,
  paceStatus,
  quoteOfTheDay,
  rivalAhead,
  runsPerWeekSoFar,
} from '@1k/core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, Share, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { MileWall } from '@/components/mile-wall';
import { ProgressBar } from '@/components/progress-bar';
import { ProgressRing } from '@/components/progress-ring';
import { Quote } from '@/components/quote';
import { Screen } from '@/components/screen';
import { recapHeadline, recapLines } from '@/components/since-last-look';
import { Text } from '@/components/text';
import { WeekStrip } from '@/components/week-strip';
import { useActiveRace, useToFinishM } from '@/lib/active-race';
import { useAuth } from '@/lib/auth';
import { greeting } from '@/lib/greeting';
import { healthStatus, syncHealth } from '@/lib/health-connect';
import { useSinceLastLook } from '@/lib/last-look';
import { useMyWeek } from '@/lib/momentum';
import { useRunnerStats } from '@/lib/race-stats';
import { useStandings } from '@/lib/races';
import { currentRecording, unsyncedRecordings, uploadRecording } from '@/lib/recorder';
import { Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export default function Home() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const userId = session?.user.id;
  const { race, loaded, refresh: refreshRaces } = useActiveRace();
  const { standings, refresh: refreshStandings } = useStandings(race?.id);
  const { week, refresh: refreshWeek } = useMyWeek(userId);
  const { stats, refresh: refreshStats } = useRunnerStats(race, userId);
  const [refreshing, setRefreshing] = useState(false);
  // Home only peeks: the leaderboard is where the race has been seen.
  const { before, recap } = useSinceLastLook(race?.id, userId, standings, race?.goal_m ?? 1, { record: false });

  const me = standings?.find((s) => s.user_id === userId);
  const board = useMemo(() => (standings ? distanceBoard(standings) : []), [standings]);
  const myPlace = board.find((r) => r.standing.user_id === userId)?.place;
  const finishers = board.filter((r) => r.finished).length;
  const combinedM = standings?.reduce((sum, s) => sum + s.total_distance_m, 0) ?? 0;

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshRaces(), refreshStandings(), refreshWeek(), refreshStats()]);
    setRefreshing(false);
  };

  if (loaded && !race) return <NoRaceYet />;
  // Until the race and standings arrive, a spinner rather than a page of zeros.
  if (!race || !standings) {
    return (
      <Screen>
        <ActivityIndicator style={{ marginTop: Space.xxl }} color={colors.accent} />
      </Screen>
    );
  }

  const goalM = race.goal_m;
  const raceWindow = { startsAt: new Date(race.starts_at), endsAt: new Date(race.ends_at), goalM };
  const countedM = me?.counted_distance_m ?? 0;
  const pace = paceStatus(countedM, raceWindow);
  const plan = finishPlan(countedM, raceWindow, runsPerWeekSoFar(me?.activity_count ?? 0, raceWindow.startsAt));
  const name = me?.profile?.display_name ?? '';
  const goalMiles = Math.round(metersToMiles(goalM));
  const progress = Math.min(1, countedM / goalM) * 100;
  // Under 10% a whole number barely moves, so show a decimal until it does.
  const percent = progress < 10 ? (Math.floor(progress * 10) / 10).toFixed(1) : String(Math.floor(progress));
  const rival = userId ? rivalAhead(standings, userId) : null;
  const typicalRunM = me?.activity_count ? me.total_distance_m / me.activity_count : 0;
  const milestones = MILESTONE_MILES.filter((m) => m <= goalMiles);

  // This week against even pace, from the same numbers as the week streak on My Race.
  const thisWeek = stats?.weeks.at(-1);
  const weekM = thisWeek?.distanceM ?? week?.distanceM ?? 0;
  const targetM = thisWeek?.targetM ?? 0;
  const onPaceThisWeek = targetM > 0 && weekM >= targetM - 0.5;
  const weeksOnPace = stats?.weekStreak.current ?? 0;

  const firstLine = recap ? recapLines(recap, me)[0] : undefined;

  const invite = () =>
    Share.share({ message: `Join me in ${race.name} on 1K Miles. Our invite code is ${race.invite_code}.` }).catch(
      () => undefined,
    );

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={{ gap: Space.xs }}>
        <Text variant="label">{race.name}</Text>
        <Text variant="heading" size={28}>
          {greeting()}
          {name ? `, ${name}` : ''}
        </Text>
      </View>

      <RecordingStatus />
      <WatchRuns onImported={refreshStandings} />

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
        {pace.finished ? (
          <>
            <Text variant="heading">You finished 🏁</Text>
            <Quote quote={milestoneQuote(goalMiles)} size={16} />
          </>
        ) : (
          <Pressable
            onPress={() => router.navigate('/my-race')}
            accessibilityRole="button"
            accessibilityHint="Opens your finish plan on My Race"
            style={{ flexDirection: 'row', alignItems: 'center', gap: Space.sm, minHeight: 44 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: pace.aheadByM >= 0 ? colors.onPace : colors.behindPace }}>
                {pace.aheadByM >= 0
                  ? `${formatMiles(pace.aheadByM)} mi ahead of even pace`
                  : `${formatMiles(-pace.aheadByM)} mi behind even pace`}
              </Text>
              {plan?.projectedFinish && (
                <Text variant="muted" size={14}>
                  {plan.onTrack
                    ? `On track to finish around ${shortDate(plan.projectedFinish)}`
                    : 'See your finish plan'}
                </Text>
              )}
            </View>
            <Text variant="muted" size={22}>
              ›
            </Text>
          </Pressable>
        )}
      </Card>

      <Button title="Start a run" onPress={() => router.push('/record')} />
      <View style={{ flexDirection: 'row', gap: Space.sm }}>
        <View style={{ flex: 1 }}>
          <Button title="Log manually" variant="secondary" onPress={() => router.push('/log-run')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Sync watch" variant="secondary" onPress={() => router.push('/health')} />
        </View>
      </View>

      {week && (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="label">This week</Text>
            <Text variant="muted" size={13}>
              {week.days} {week.days === 1 ? 'day' : 'days'} · {formatMiles(weekM)} mi
            </Text>
          </View>
          <WeekStrip ran={week.ran} today={week.today} />
          {!pace.finished && targetM > 0 && (
            <View style={{ gap: Space.xs }}>
              <ProgressBar progress={weekM / targetM} />
              <Text style={{ fontWeight: '700', color: onPaceThisWeek ? colors.onPace : colors.text }}>
                {onPaceThisWeek
                  ? `On pace this week ✓${weeksOnPace >= 2 ? ` · ${weeksOnPace} weeks in a row` : ''}`
                  : `${formatMiles(weekM)} of ${formatMiles(targetM)} mi to stay on pace`}
              </Text>
            </View>
          )}
        </Card>
      )}

      <Card>
        <Text variant="label">Together</Text>
        <Text variant="heading">{formatMiles(combinedM, 0)} miles as a team</Text>
        <Text variant="muted">
          {finishers} of {standings.length} finished
        </Text>
        {recap && before && (
          <Pressable
            onPress={() => router.push('/leaderboard')}
            accessibilityRole="link"
            style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: Space.sm, gap: 2 }}>
            <Text style={{ fontWeight: '800' }}>{recapHeadline(recap, before.at)} ›</Text>
            {firstLine && <Text variant="muted">{`${firstLine.emoji} ${firstLine.text}`}</Text>}
          </Pressable>
        )}
        <Button title="Invite a friend" variant="secondary" onPress={invite} />
      </Card>

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

      <Pressable
        onPress={() => router.navigate('/my-race')}
        accessibilityRole="button"
        accessibilityHint="Opens My Race"
        style={{ flexDirection: 'row', gap: Space.sm }}>
        <Stat label="Place" value={myPlace ? `#${myPlace}` : '–'} />
        <Stat label="Runs" value={String(me?.activity_count ?? 0)} />
        <Stat
          label="Avg pace"
          value={me?.counted_distance_m ? formatPace(paceSecondsPerMile(me.counted_distance_m, me.counted_moving_time_s)) : '–'}
        />
      </Pressable>

      <Quote quote={quoteOfTheDay()} />
    </Screen>
  );
}

/** "Sep 14", with the year only when it isn't this one. */
function shortDate(d: Date, now: Date = new Date()): string {
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
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
