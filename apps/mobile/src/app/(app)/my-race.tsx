import { finishPlan, formatMiles } from '@1k/core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, View } from 'react-native';

import { AdminLink } from '@/components/admin-link';
import { Card } from '@/components/card';
import { FinishPlanner } from '@/components/finish-planner';
import { RaceStatsView, goalMilesOf } from '@/components/race-stats';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useActiveRace } from '@/lib/active-race';
import { canReview, usePendingReviews, useTurnedDown } from '@/lib/admin';
import { signOut, signOutBlocker, useAuth } from '@/lib/auth';
import { resetTour } from '@/lib/onboarding';
import { useRunnerStats } from '@/lib/race-stats';
import { useStandings } from '@/lib/races';
import { Space } from '@/theme/tokens';

export default function MyRace() {
  const { session } = useAuth();
  const { race, loaded } = useActiveRace();
  const { stats, error, refresh } = useRunnerStats(race, session?.user.id);
  const { standings } = useStandings(race?.id);
  const me = standings?.find((s) => s.user_id === session?.user.id);
  const raceWindow = race
    ? { startsAt: new Date(race.starts_at), endsAt: new Date(race.ends_at), goalM: race.goal_m }
    : null;
  // Nothing to plan once the goal is reached or the race is over.
  const planning = raceWindow && me && finishPlan(me.counted_distance_m, raceWindow, 1) !== null;
  const [refreshing, setRefreshing] = useState(false);
  const reviewer = canReview(race);
  const { runs: waiting, refresh: refreshWaiting } = usePendingReviews(race);
  const { runs: turnedDown, refresh: refreshTurnedDown } = useTurnedDown(session?.user.id);
  useFocusEffect(
    useCallback(() => {
      refreshWaiting();
      refreshTurnedDown();
    }, [refreshWaiting, refreshTurnedDown]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={{ gap: Space.xs }}>
        <Text variant="label">{race?.name ?? ' '}</Text>
        <Text variant="heading" size={28}>
          My Race
        </Text>
      </View>
      {reviewer && <AdminLink waiting={waiting?.length ?? 0} onPress={() => router.push('/admin')} />}
      {loaded && !race && (
        <Card>
          <Text variant="heading">Join a race to see your stats</Text>
        </Card>
      )}
      {error && !stats && <Text variant="muted">Couldn’t load your stats. Pull down to try again.</Text>}
      {planning && raceWindow && me && (
        <Card>
          <Text variant="label">Finish plan</Text>
          <FinishPlanner totalM={me.counted_distance_m} race={raceWindow} runs={me.activity_count} />
        </Card>
      )}
      {turnedDown.length > 0 && (
        <Card>
          <Text variant="label">Not counted</Text>
          <Text variant="muted">An organizer looked at these and left them out. If one looks wrong, ask them about it.</Text>
          {turnedDown.map((r) => (
            <View key={r.id} style={{ gap: 2 }}>
              <Text style={{ fontWeight: '700' }}>
                {formatMiles(r.distance_m)} mi {r.type} ·{' '}
                {new Date(r.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </Text>
              {r.note && <Text variant="muted">“{r.note}”</Text>}
            </View>
          ))}
        </Card>
      )}
      {race && stats && <RaceStatsView stats={stats} name="You" isMe goalMiles={goalMilesOf(race.goal_m)} />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: Space.lg }}>
        <TextLink title="How the race works" onPress={() => router.push('/rules')} />
        {race && session && (
          <TextLink
            title="Replay the tour"
            onPress={() => {
              resetTour(session.user.id);
              router.navigate('/');
            }}
          />
        )}
        {session && <TextLink title="Sign out" onPress={confirmSignOut} />}
      </View>
    </Screen>
  );
}

function confirmSignOut() {
  const blocker = signOutBlocker();
  if (blocker === 'recording') {
    return Alert.alert('Finish your run first', 'You’re in the middle of a run. Finish it, then sign out.');
  }
  if (blocker === 'uploading') {
    return Alert.alert(
      'Your run hasn’t uploaded yet',
      'Open Home with a signal so it can upload, then sign out. Otherwise it could end up on the wrong account.',
    );
  }
  Alert.alert('Sign out?', 'Your runs and miles stay saved. Sign back in any time.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Sign out',
      style: 'destructive',
      onPress: () =>
        signOut().catch((e: unknown) =>
          Alert.alert('Couldn’t sign out', e instanceof Error ? e.message : 'Try again.'),
        ),
    },
  ]);
}

function TextLink({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8} style={{ paddingVertical: Space.sm }}>
      <Text variant="muted" style={{ fontWeight: '700' }}>
        {title}
      </Text>
    </Pressable>
  );
}
