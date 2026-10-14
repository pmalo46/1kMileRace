import { formatMiles, metersToMiles, milesToMeters, nextMilestone, passedBy, runQuote, runsToCover } from '@1k/core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useActiveRace } from '@/lib/active-race';
import type { LogResult } from '@/lib/activities';
import { useAuth } from '@/lib/auth';
import { useStandings } from '@/lib/races';
import { Space, Sunrise } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { Button } from './button';
import { Card } from './card';
import { MileWall } from './mile-wall';
import { Quote } from './quote';
import { Screen } from './screen';
import { Text } from './text';

/**
 * The "you just added miles" screen shown after a run saves: the run's miles light up on
 * the wall, then what they changed, in the runner's own race.
 */
export function Logged({ result, miles }: { result: LogResult; miles: string }) {
  const { session } = useAuth();
  const { colors } = useTheme();
  const { race } = useActiveRace();
  const { standings, refresh } = useStandings(race?.id);
  // Chosen once, so it doesn't change under the reader if the screen re-renders.
  const [quote] = useState(() => runQuote('after', Date.now()));

  // The standings on hand may predate this run.
  useEffect(() => {
    refresh();
  }, [refresh]);

  const races = result.countedIn.map((c) => c.race).join(', ');
  const countedMiles = result.countedIn.find((c) => c.race === race?.name)?.countedMiles ?? 0;
  const me = standings?.find((s) => s.user_id === session?.user.id);
  const goalMiles = race ? Math.round(metersToMiles(race.goal_m)) : 0;
  const totalMiles = me ? metersToMiles(me.counted_distance_m) : 0;
  const freshTiles = Math.floor(totalMiles) - Math.floor(Math.max(0, totalMiles - countedMiles));

  const passed = standings && session ? passedBy(standings, session.user.id, milesToMeters(countedMiles)) : [];
  const next = me && race ? nextMilestone(me.counted_distance_m, race.goal_m) : null;
  const runsToNext = next ? runsToCover(next.toGoM, milesToMeters(countedMiles)) : null;
  const passedNames = passed.map((s) => s.profile?.display_name ?? 'a runner');

  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: Space.xs, marginTop: Space.lg }}>
        <Text variant="display" size={64}>
          +{miles}
        </Text>
        <Text variant="heading" style={{ textAlign: 'center' }}>
          {miles === '1' ? 'mile' : 'miles'} closer.
        </Text>
      </View>

      {me && race && countedMiles > 0 && (
        <Card>
          <MileWall goalMiles={goalMiles} filledMiles={totalMiles} freshMiles={freshTiles} animate />
          <View style={{ flexDirection: 'row', gap: Space.md, flexWrap: 'wrap' }}>
            <Key color={colors.accent} label="Run" />
            <Key color={Sunrise[2]} label="This run" />
            <Key color={colors.track} label="To go" />
          </View>
          <Text variant="muted">
            {freshTiles > 0
              ? `${freshTiles} more ${freshTiles === 1 ? 'tile' : 'tiles'} of your ${goalMiles.toLocaleString()}. ${formatMiles(me.counted_distance_m)} miles done.`
              : `Part of the way through tile ${(Math.floor(totalMiles) + 1).toLocaleString()} of ${goalMiles.toLocaleString()}.`}
          </Text>
        </Card>
      )}

      {passedNames.length > 0 && (
        <Card>
          <Text variant="label">Moved up</Text>
          <Text variant="heading">
            You passed {passedNames.length <= 2 ? passedNames.join(' and ') : `${passedNames.length} runners`}
          </Text>
        </Card>
      )}

      {next && runsToNext && (
        <Card>
          <Text variant="label">Next badge</Text>
          <Text variant="heading">
            {formatMiles(next.toGoM)} miles to {next.miles.toLocaleString()}
          </Text>
          <Text variant="muted">
            {runsToNext === 1 ? 'One more run like this gets you there.' : `${runsToNext} runs like this one get you there.`}
          </Text>
        </Card>
      )}

      <Quote quote={quote} align="center" style={{ marginVertical: Space.sm }} />

      <Text variant="muted" style={{ textAlign: 'center' }}>
        {races
          ? `Counted toward ${races}.`
          : 'Saved, but it isn’t inside any of your races’ dates, so it doesn’t count toward one yet.'}
        {result.evaluation.status === 'flagged' ? ' An organizer may take a look; it counts in the meantime.' : ''}
      </Text>
      <Button title="Done" onPress={() => router.back()} />
    </Screen>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.xs }}>
      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: color }} />
      <Text variant="muted" size={13}>
        {label}
      </Text>
    </View>
  );
}
