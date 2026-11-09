import { finishPlan } from '@1k/core';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { Card } from '@/components/card';
import { FinishPlanner } from '@/components/finish-planner';
import { RaceStatsView, goalMilesOf } from '@/components/race-stats';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useActiveRace } from '@/lib/active-race';
import { useAuth } from '@/lib/auth';
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
      {race && stats && <RaceStatsView stats={stats} name="You" isMe goalMiles={goalMilesOf(race.goal_m)} />}
    </Screen>
  );
}
