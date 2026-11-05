import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

import { RaceStatsView, goalMilesOf } from '@/components/race-stats';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useActiveRace } from '@/lib/active-race';
import { useAuth } from '@/lib/auth';
import { useRunnerStats } from '@/lib/race-stats';
import { useStandings } from '@/lib/races';
import { Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** A racemate's race, opened from their card on the leaderboard. */
export default function Runner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { session } = useAuth();
  const { race } = useActiveRace();
  const { standings } = useStandings(race?.id);
  const { stats, error, refresh } = useRunnerStats(race, id);
  const [refreshing, setRefreshing] = useState(false);
  const isMe = id === session?.user.id;
  const name = standings?.find((s) => s.user_id === id)?.profile?.display_name ?? 'Runner';

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/leaderboard'))}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={12}
        style={{ alignSelf: 'flex-start' }}>
        <Text style={{ color: colors.accent, fontWeight: '700' }}>‹ Leaderboard</Text>
      </Pressable>
      <View style={{ gap: Space.xs }}>
        <Text variant="label">{race?.name ?? ' '}</Text>
        <Text variant="heading" size={28}>
          {isMe ? 'My Race' : `${name}’s race`}
        </Text>
      </View>
      {error && !stats && <Text variant="muted">Couldn’t load these stats. Pull down to try again.</Text>}
      {race && stats && <RaceStatsView stats={stats} name={name} isMe={isMe} goalMiles={goalMilesOf(race.goal_m)} />}
    </Screen>
  );
}
