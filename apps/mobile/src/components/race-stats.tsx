import { WALK_PACE_S_PER_MI, formatMiles, formatPace, metersToMiles, type RaceStats, type StatWeek } from '@1k/core';
import { View } from 'react-native';

import { Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { Card } from './card';
import { Bars } from './charts/bars';
import { LineChart } from './charts/line';
import { SplitBar } from './charts/split-bar';
import { Text } from './text';

const FEET_PER_METER = 3.28084;
const EMPIRE_STATE_FT = 1454;

const day = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** "12 h 5 m" or "45 m": easier to read than a stopwatch for long totals. */
function hoursMinutes(seconds: number): string {
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} h ${m} m` : `${m} m`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/**
 * Everything about how a runner's race has gone. The same view shows your own stats on the
 * My Race tab and a racemate's when you tap them on the leaderboard.
 */
export function RaceStatsView({
  stats,
  name,
  isMe,
  goalMiles,
}: {
  stats: RaceStats;
  name: string;
  isMe: boolean;
  goalMiles: number;
}) {
  const { colors } = useTheme();
  const who = isMe ? 'You' : name;

  if (stats.count === 0) {
    return (
      <Card>
        <Text variant="heading">
          {isMe ? 'Your stats fill in after your first run' : `${name} hasn’t logged a run yet`}
        </Text>
        <Text variant="muted">Weekly miles, pace, streaks and more show up here.</Text>
      </Card>
    );
  }

  const thisWeek = stats.weeks.at(-1);
  const crowded = stats.weeks.length > 12;
  const weekBars = stats.weeks.map((w) => ({
    key: String(w.number),
    value: w.distanceM,
    highlight: w === stats.bestWeek,
    label: !crowded || w.number === 1 || w.number % 4 === 0 ? String(w.number) : undefined,
  }));
  const sameWeek = stats.bestWeek && stats.bestWeek === stats.toughestWeek;
  const change = stats.paceChangeS;
  const ft = stats.climbM != null ? Math.round(stats.climbM * FEET_PER_METER) : 0;

  return (
    <View style={{ gap: Space.md }}>
      {/* Headline */}
      <Card>
        <Text variant="label">So far</Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: Space.sm,
          }}>
          <Text variant="display" size={48}>
            {formatMiles(stats.distanceM)}
          </Text>
          <Text variant="muted" style={{ marginBottom: 8 }}>
            miles
          </Text>
        </View>
        <Text variant="muted">
          {plural(stats.count, 'run or walk', 'runs and walks')} on {plural(stats.activeDays, 'day')}
          {stats.marathons >= 1 ? ` · ${stats.marathons.toFixed(1)} marathons’ worth` : ''}
        </Text>
        <View style={{ flexDirection: 'row', gap: Space.sm }}>
          <Tile label="Average distance" value={`${formatMiles(stats.avgDistanceM)} mi`} />
          <Tile label="Time moving" value={hoursMinutes(stats.movingTimeS)} />
        </View>
      </Card>

      {/* Banked miles */}
      {stats.weeks.length > 0 && (
        <Card>
          <Text variant="label">Miles in the bank</Text>
          <Text variant="heading">
            {stats.aheadByM >= 0
              ? `${formatMiles(stats.aheadByM)} mi ahead of even pace`
              : `${formatMiles(-stats.aheadByM)} mi from even pace`}
          </Text>
          <LineChart
            accessibilityLabel={`Total miles by week against the even pace to ${goalMiles.toLocaleString()} miles`}
            series={[
              {
                label: `Even pace to ${goalMiles.toLocaleString()}`,
                values: [0, ...stats.weeks.map((w) => w.expectedM)],
                reference: true,
              },
              {
                label: isMe ? 'Your miles' : `${name}’s miles`,
                values: [0, ...stats.weeks.map((w) => w.cumulativeM)],
              },
            ]}
          />
          <Text variant="muted" size={14}>
            {stats.aheadByM >= 0
              ? 'Miles banked now make the last weeks lighter.'
              : 'A few bigger weeks close it. Every mile counts the same.'}
          </Text>
        </Card>
      )}

      {/* Weeks */}
      {stats.bestWeek && (
        <Card>
          <Text variant="label">Week by week</Text>
          <Bars bars={weekBars} accessibilityLabel={`Miles in each race week, ${stats.weeks.length} weeks so far`} />
          <Text variant="muted" size={12} style={{ textAlign: 'center' }}>
            Race week
          </Text>
          <WeekLine
            title={sameWeek ? 'Biggest and hardest week' : 'Biggest week'}
            week={stats.bestWeek}
            value={`${formatMiles(stats.bestWeek.distanceM)} mi${sameWeek ? ` · ${hoursMinutes(stats.bestWeek.movingTimeS)}` : ''}`}
          />
          {!sameWeek && stats.toughestWeek && (
            <WeekLine
              title="Most time on your feet"
              week={stats.toughestWeek}
              value={hoursMinutes(stats.toughestWeek.movingTimeS)}
            />
          )}
          {thisWeek && thisWeek !== stats.bestWeek && (
            <WeekLine title="This week" week={thisWeek} value={`${formatMiles(thisWeek.distanceM)} mi`} />
          )}
        </Card>
      )}

      {/* Run vs walk */}
      <Card>
        <Text variant="label">Running and walking</Text>
        <SplitBar left="running" right="walking" share={stats.gait.runShare} />
        <Text variant="muted" size={14}>
          Share of miles. Slower than {formatPace(WALK_PACE_S_PER_MI)} a mile counts as walking.
          {stats.gait.measured > 0
            ? ' Runs recorded in the app count their walk breaks as walking; others go by their average pace.'
            : ''}
        </Text>
      </Card>

      {/* Pace */}
      <Card>
        <Text variant="label">Pace</Text>
        <View style={{ flexDirection: 'row', gap: Space.sm }}>
          <Tile
            label="Running"
            value={stats.gait.run.paceS != null ? `${formatPace(stats.gait.run.paceS)}` : '–'}
            sub="a mile"
          />
          <Tile
            label="Walking"
            value={stats.gait.walk.paceS != null ? `${formatPace(stats.gait.walk.paceS)}` : '–'}
            sub="a mile"
          />
        </View>
        {change != null && (
          <Text
            style={{
              fontWeight: '700',
              color: change > 5 ? colors.onPace : colors.text,
            }}>
            {change > 5
              ? `Running ${formatPace(change)} a mile faster than in the first weeks`
              : change < -5
                ? `Running ${formatPace(-change)} a mile slower than in the first weeks. Easy miles still count.`
                : 'Running about the same pace as in the first weeks'}
          </Text>
        )}
      </Card>

      {/* Records */}
      <Card>
        <Text variant="label">Personal records</Text>
        {stats.longest && (
          <RecordLine
            title="Longest"
            value={`${formatMiles(stats.longest.distanceM)} mi`}
            on={stats.longest.startedAt}
          />
        )}
        {stats.fastest && (
          <RecordLine
            title="Fastest pace"
            value={`${formatPace(stats.fastest.paceS)} a mile over ${formatMiles(stats.fastest.distanceM)} mi`}
            on={stats.fastest.startedAt}
          />
        )}
        {stats.biggestClimb && (
          <RecordLine
            title="Biggest climb"
            value={`${Math.round(stats.biggestClimb.elevationGainM! * FEET_PER_METER).toLocaleString()} ft`}
            on={stats.biggestClimb.startedAt}
          />
        )}
      </Card>

      {/* Streaks */}
      <Card>
        <Text variant="label">Streaks</Text>
        <View style={{ flexDirection: 'row', gap: Space.sm }}>
          <Tile label="Days in a row" value={String(stats.dayStreak.current)} sub={`best ${stats.dayStreak.longest}`} />
          <Tile
            label="Weeks on pace in a row"
            value={String(stats.weekStreak.current)}
            sub={`best ${stats.weekStreak.longest}`}
          />
        </View>
        <Text variant="muted" size={14}>
          A week is on pace at {formatMiles(stats.weeklyTargetM)} miles, the even pace to{' '}
          {goalMiles.toLocaleString()}.
        </Text>
      </Card>

      {/* When */}
      <Card>
        <Text variant="label">{isMe ? 'When you run' : `When ${name} runs`}</Text>
        {stats.favoriteDayPart && (
          <Text variant="heading">
            {who} {isMe ? 'are' : 'is'}{' '}
            {stats.favoriteDayPart === 'Night'
              ? 'a night owl'
              : `mostly out in the ${stats.favoriteDayPart.toLowerCase()}`}
          </Text>
        )}
        <Bars
          height={70}
          accessibilityLabel="Runs and walks by time of day"
          bars={stats.dayParts.map((p) => ({
            key: p.part,
            value: p.count,
            label: p.part,
            highlight: p.part === stats.favoriteDayPart,
          }))}
        />
        <Bars
          height={70}
          accessibilityLabel="Runs and walks by day of the week"
          bars={stats.weekdays.map((d) => ({
            key: d.day,
            value: d.count,
            label: d.day.slice(0, 3),
            highlight: d.day === stats.favoriteWeekday,
          }))}
        />
        {stats.favoriteWeekday && <Text variant="muted">Favorite day: {stats.favoriteWeekday}</Text>}
      </Card>

      {/* Where */}
      <Card>
        <Text variant="label">Where</Text>
        <SplitBar left="outside" right="treadmill" share={stats.distanceM > 0 ? stats.outdoorM / stats.distanceM : 1} />
      </Card>

      {/* Climbing: only in-app recordings measure it. */}
      {stats.climbM != null && ft > 0 && (
        <Card>
          <Text variant="label">Climbing</Text>
          <Text variant="heading">{ft.toLocaleString()} ft up</Text>
          <Text variant="muted">
            {ft >= EMPIRE_STATE_FT / 2
              ? `About ${(ft / EMPIRE_STATE_FT).toFixed(1)} times up the Empire State Building. `
              : ''}
            Counts runs recorded in the app.
          </Text>
        </Card>
      )}
    </View>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surfaceAlt,
        borderRadius: 16,
        padding: Space.sm,
        alignItems: 'center',
      }}>
      <Text variant="display" size={24}>
        {value}
      </Text>
      {sub && (
        <Text variant="muted" size={12}>
          {sub}
        </Text>
      )}
      <Text variant="label" size={11} style={{ textAlign: 'center' }}>
        {label}
      </Text>
    </View>
  );
}

function WeekLine({ title, week, value }: { title: string; week: StatWeek; value: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: Space.sm,
      }}>
      <View style={{ flexShrink: 1 }}>
        <Text style={{ fontWeight: '800' }}>{title}</Text>
        <Text variant="muted" size={13}>
          Week {week.number}, starting {day(week.start)}
        </Text>
      </View>
      <Text variant="display" size={18}>
        {value}
      </Text>
    </View>
  );
}

function RecordLine({ title, value, on }: { title: string; value: string; on: Date }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: Space.sm,
      }}>
      <View style={{ flexShrink: 1 }}>
        <Text style={{ fontWeight: '800' }}>{title}</Text>
        <Text variant="muted" size={13}>
          {day(on)}
        </Text>
      </View>
      <Text style={{ fontWeight: '700', flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

/** Miles as a whole number for headers. */
export const goalMilesOf = (goalM: number) => Math.round(metersToMiles(goalM));
