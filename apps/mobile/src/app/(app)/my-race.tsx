import { useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { Card } from '@/components/card';
import { RaceStatsView, goalMilesOf } from '@/components/race-stats';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useActiveRace } from '@/lib/active-race';
import { useAuth } from '@/lib/auth';
import { useRunnerStats } from '@/lib/race-stats';
import { Space } from '@/theme/tokens';

export default function MyRace() {
  const { session } = useAuth();
  const { race, loaded } = useActiveRace();
  const { stats, error, refresh } = useRunnerStats(race, session?.user.id);
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
      {race && stats && <RaceStatsView stats={stats} name="You" isMe goalMiles={goalMilesOf(race.goal_m)} />}
    </Screen>
  );
}
