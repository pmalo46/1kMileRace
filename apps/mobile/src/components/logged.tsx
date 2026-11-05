import {
  MILESTONE_MILES,
  formatMiles,
  formatPace,
  mileSplits,
  metersToMiles,
  milesToMeters,
  nextMilestone,
  passedBy,
  runQuote,
  runsToCover,
  type TrackSummary,
} from '@1k/core';
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
import { SplitBar } from './charts/split-bar';
import { MileWall } from './mile-wall';
import { Quote } from './quote';
import { Screen } from './screen';
import { Text } from './text';

/**
 * The "you just added miles" screen shown after a run saves: the run's miles light up on
 * the wall, then what they changed, in the runner's own race.
 */
export function Logged({ result, miles, track }: { result: LogResult; miles: string; track?: TrackSummary }) {
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
          <MileWall
            goalMiles={goalMiles}
            filledMiles={totalMiles}
            freshMiles={freshTiles}
            milestones={MILESTONE_MILES.filter((m) => m <= goalMiles)}
            animate
          />
          <View style={{ flexDirection: 'row', gap: Space.md, flexWrap: 'wrap' }}>
            <Key color={colors.accent} label="Run" />
            <Key color={Sunrise[2]} label="This run" />
            <Key color={colors.track} label="To go" />
            <Key color="#F5B700" label="Milestone" />
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
          <Text variant="label">Next milestone</Text>
          <Text variant="heading">
            {formatMiles(next.toGoM)} miles to {next.miles.toLocaleString()}
          </Text>
          <Text variant="muted">
            {next.toGoM <= milesToMeters(countedMiles)
              ? 'One more run like this'
              : `About ${runsToNext === 1 ? 'one more run' : `${runsToNext} more runs`} like this`}
          </Text>
        </Card>
      )}

      {track && <Splits track={track} />}

      <Quote quote={quote} align="center" style={{ marginVertical: Space.sm }} />

      <Text variant="muted" style={{ textAlign: 'center' }}>
        {races ? `Counted toward ${races}` : 'Saved, but outside your race dates'}
        {result.evaluation.status === 'flagged' ? ' · Counts while an organizer reviews it' : ''}
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

/** Each mile's time from a GPS recording, the fastest picked out, and how much was running. */
function Splits({ track }: { track: TrackSummary }) {
  const { colors } = useTheme();
  const splits = mileSplits(track.splits, track.distanceM, track.movingTimeS);
  const walkedM = track.gait.walk.distanceM;
  const movedM = track.gait.run.distanceM + walkedM;
  if (splits.length === 0 && movedM === 0) return null;
  // Only whole miles compete for fastest; a short last bit is easy to run quickly.
  const whole = splits.filter((s) => s.miles === 1);
  const fastest = whole.length > 1 ? Math.min(...whole.map((s) => s.paceS)) : null;
  const slowest = Math.max(...splits.map((s) => s.paceS));
  return (
    <Card>
      <Text variant="label">Splits</Text>
      {splits.map((s) => {
        const best = s.paceS === fastest;
        return (
          <View key={s.mile} style={{ flexDirection: 'row', alignItems: 'center', gap: Space.sm }}>
            <Text variant="muted" size={14} style={{ width: 84 }}>
              {s.miles === 1 ? `Mile ${s.mile}` : `Last ${s.miles.toFixed(1)} mi`}
            </Text>
            {/* Faster miles get longer bars. */}
            <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.track, overflow: 'hidden' }}>
              <View
                style={{
                  width: `${Math.max(15, (Math.min(...splits.map((x) => x.paceS)) / s.paceS) * 100)}%`,
                  height: '100%',
                  borderRadius: 5,
                  backgroundColor: best ? colors.accent : colors.textMuted,
                  opacity: best ? 1 : 0.5,
                }}
              />
            </View>
            <Text style={{ width: 72, textAlign: 'right', fontWeight: best ? '800' : '600' }}>
              {formatPace(s.paceS)}
              {best ? ' ⚡' : ''}
            </Text>
          </View>
        );
      })}
      {splits.length > 0 && (
        <Text variant="muted" size={13}>
          Pace for each mile{fastest != null && fastest < slowest ? '. ⚡ marks your fastest.' : '.'}
        </Text>
      )}
      {movedM > 0 && walkedM > 0 && (
        <View style={{ gap: Space.xs, marginTop: Space.xs }}>
          <SplitBar left="running" right="walking" share={track.gait.run.distanceM / movedM} />
        </View>
      )}
      {movedM > 0 && walkedM === 0 && <Text variant="muted">Ran the whole way.</Text>}
    </Card>
  );
}
