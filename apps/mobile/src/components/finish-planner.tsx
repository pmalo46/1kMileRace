import { finishPlan, formatMiles, runsPerWeekSoFar, type RaceWindow } from '@1k/core';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Radius, Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { Text } from './text';

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** "Sep 14", with the year only when it isn't this one. */
function day(d: Date, now: Date = new Date()): string {
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

/**
 * What it takes to finish on time: pick how many days a week you'll run, and see how far
 * each run has to go. Fewer days, or a skipped week, and the number climbs.
 */
export function FinishPlanner({ totalM, race, runs }: { totalM: number; race: RaceWindow; runs: number }) {
  const { colors } = useTheme();
  // Starts at how often they've actually been running.
  const [perWeek, setPerWeek] = useState(() => runsPerWeekSoFar(runs, race.startsAt));
  const plan = finishPlan(totalM, race, perWeek);
  if (!plan) return null;

  return (
    <View style={{ gap: Space.sm }}>
      {plan.projectedFinish ? (
        <Text style={{ fontWeight: '800', color: plan.onTrack ? colors.onPace : colors.behindPace }}>
          {plan.onTrack
            ? `On track to finish around ${day(plan.projectedFinish)}`
            : `At this rate you’d finish ${day(plan.projectedFinish)}, after the race ends`}
        </Text>
      ) : (
        <Text variant="muted">Log a run to see when you’ll finish</Text>
      )}
      <Text variant="label">Runs per week</Text>
      <View style={{ flexDirection: 'row', gap: Space.xs }}>
        {DAYS.map((n) => {
          const selected = n === perWeek;
          return (
            <Pressable
              key={n}
              accessibilityRole="button"
              accessibilityLabel={`${n} ${n === 1 ? 'run' : 'runs'} a week`}
              accessibilityState={{ selected }}
              onPress={() => {
                if (selected) return;
                Haptics.selectionAsync();
                setPerWeek(n);
              }}
              style={{
                flex: 1,
                minHeight: 40,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: Radius.sm,
                backgroundColor: selected ? colors.accent : colors.surfaceAlt,
              }}>
              <Text style={{ fontWeight: '800', color: selected ? '#fff' : colors.text }}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text variant="heading">
        {formatMiles(plan.perRunM)} mi per run to finish on time
      </Text>
      {plan.afterSkippedWeekM != null && (
        <Text variant="muted">Skip a week and it’s {formatMiles(plan.afterSkippedWeekM)} mi per run</Text>
      )}
    </View>
  );
}
