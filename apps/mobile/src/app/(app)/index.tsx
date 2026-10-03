import {
  distanceBoard,
  formatMiles,
  formatPace,
  metersToMiles,
  paceSecondsPerMile,
  paceStatus,
} from '@1k/core';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ProgressRing } from '@/components/progress-ring';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useActiveRace } from '@/lib/active-race';
import { useAuth } from '@/lib/auth';
import { greeting } from '@/lib/greeting';
import { useStandings } from '@/lib/races';
import { Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export default function Home() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const { race, loaded, refresh: refreshRaces } = useActiveRace();
  const { standings, refresh: refreshStandings } = useStandings(race?.id);
  const [refreshing, setRefreshing] = useState(false);

  const me = standings?.find((s) => s.user_id === session?.user.id);
  const board = useMemo(() => (standings ? distanceBoard(standings) : []), [standings]);
  const myPlace = board.find((r) => r.standing.user_id === session?.user.id)?.place;
  const finishers = board.filter((r) => r.finished).length;
  const combinedM = standings?.reduce((sum, s) => sum + s.total_distance_m, 0) ?? 0;

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshRaces(), refreshStandings()]);
    setRefreshing(false);
  };

  if (loaded && !race) return <NoRaceYet />;

  const goalM = race?.goal_m ?? 1;
  const countedM = me?.counted_distance_m ?? 0;
  const pace = race
    ? paceStatus(countedM, { startsAt: new Date(race.starts_at), endsAt: new Date(race.ends_at), goalM })
    : null;
  const name = me?.profile?.display_name ?? '';

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={{ gap: Space.xs }}>
        <Text variant="label">{race?.name ?? ' '}</Text>
        <Text variant="heading" size={28}>
          {greeting()}
          {name ? `, ${name}` : ''}
        </Text>
      </View>

      <View style={{ alignItems: 'center', paddingVertical: Space.md }}>
        <ProgressRing progress={countedM / goalM}>
          <Text variant="display">{formatMiles(countedM)}</Text>
          <Text variant="muted">of {Math.round(metersToMiles(goalM)).toLocaleString()} miles</Text>
        </ProgressRing>
      </View>

      <Button title="Log a run" onPress={() => router.push('/log-run')} />

      {pace && (
        <Card>
          {pace.finished ? (
            <Text variant="heading">You did it. 1,000 miles. 🏁</Text>
          ) : pace.aheadByM >= 0 ? (
            <>
              <Text variant="heading" style={{ color: colors.onPace }}>
                {formatMiles(pace.aheadByM)} mi ahead of pace
              </Text>
              <Text variant="muted">Keep this rhythm and you’ll finish early.</Text>
            </>
          ) : (
            <>
              <Text variant="heading" style={{ color: colors.behindPace }}>
                {metersToMiles(pace.requiredDailyM).toFixed(1)} mi a day gets you there
              </Text>
              <Text variant="muted">
                {Math.ceil(pace.daysRemaining)} days left. Every mile from here counts. You’ve got this.
              </Text>
            </>
          )}
        </Card>
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
        <Text variant="muted">{formatMiles(combinedM, 0)} miles run and walked as a crew so far.</Text>
      </Card>

      {race && (
        <Card>
          <Text variant="label">Invite friends</Text>
          <Text variant="muted">Share this code so they can join {race.name}:</Text>
          <Text variant="display" size={32} selectable>
            {race.invite_code}
          </Text>
        </Card>
      )}
    </Screen>
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
        <Text variant="muted" style={{ textAlign: 'center' }}>
          Join a friend’s race with an invite code, or start one and bring your people.
        </Text>
      </View>
      <View style={{ gap: Space.sm, marginTop: Space.lg }}>
        <Button title="Join a race" onPress={() => router.push('/join')} />
        <Button title="Start a new race" variant="secondary" onPress={() => router.push('/create-race')} />
      </View>
    </Screen>
  );
}
