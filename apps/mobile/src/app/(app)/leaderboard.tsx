import { distanceBoard, formatDuration, formatMiles, placeChanges, placeChangesSince, rivalAhead, timeBoard } from '@1k/core';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { ProgressBar } from '@/components/progress-bar';
import { Segmented } from '@/components/segmented';
import { SinceLastLook } from '@/components/since-last-look';
import { Text } from '@/components/text';
import { useActiveRace } from '@/lib/active-race';
import { useAuth } from '@/lib/auth';
import { useSinceLastLook } from '@/lib/last-look';
import { useRaceWeek } from '@/lib/momentum';
import { useStandings } from '@/lib/races';
import type { Standing } from '@/lib/types';
import { Medal, Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

type Board = 'race' | 'week' | 'time';

const BOARDS = [
  { value: 'race', label: 'Overall' },
  { value: 'week', label: 'Week' },
  { value: 'time', label: 'Fastest' },
] as const;

interface Row {
  standing: Standing;
  place: number | null;
  primary: string;
  secondary: string;
  progress: number;
  /** Places gained (+) or lost (-) since the last look (or this morning); only on the race board. */
  moved: number;
  ranToday: boolean;
}

const nameOf = (s: Standing) => s.profile?.display_name ?? 'Runner';

export default function Leaderboard() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const { race } = useActiveRace();
  const { standings, refresh: refreshStandings } = useStandings(race?.id);
  const { raceWeek, refresh: refreshWeek } = useRaceWeek(race?.id);
  const [board, setBoard] = useState<Board>('race');
  const goalM = race?.goal_m ?? 1;
  const userId = session?.user.id;
  const { before, recap } = useSinceLastLook(race?.id, userId, standings, goalM, { record: true });
  // Rows open in their old order, then move to where they are now, so you see the race shift.
  const [settled, setSettled] = useState(false);
  useFocusEffect(useCallback(() => () => setSettled(false), []));
  const ready = !!standings && !!before;
  useEffect(() => {
    if (!ready || settled) return;
    const timer = setTimeout(() => {
      setSettled(true);
      if (recap?.youPassed.length) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 700);
    return () => clearTimeout(timer);
  }, [ready, settled, recap]);

  const rows: Row[] = useMemo(() => {
    if (!standings) return [];
    const todayM = raceWeek?.todayM ?? new Map<string, number>();
    const ranToday = (s: Standing) => (todayM.get(s.user_id) ?? 0) > 0;

    if (board === 'race') {
      const moved = before ? placeChangesSince(before.standings, standings) : placeChanges(standings, todayM);
      return distanceBoard(standings).map(({ standing, place, finished }) => ({
        standing,
        place,
        primary: `${formatMiles(standing.counted_distance_m)} mi`,
        secondary: finished ? 'Finished 🏁' : `${formatMiles(goalM - standing.counted_distance_m)} to go`,
        progress: standing.counted_distance_m / goalM,
        moved: moved.get(standing.user_id) ?? 0,
        ranToday: ranToday(standing),
      }));
    }

    if (board === 'week') {
      const weekM = raceWeek?.weekM ?? new Map<string, number>();
      const ranked = standings
        .map((standing) => ({ standing, m: weekM.get(standing.user_id) ?? 0 }))
        .sort((a, b) => b.m - a.m);
      const best = ranked[0]?.m ?? 0;
      return ranked.map(({ standing, m }, i) => ({
        standing,
        // Tied runners share a place; nobody places on a week they haven't run in.
        place: m > 0 ? ranked.findIndex((r) => r.m === m) + 1 : null,
        primary: `${formatMiles(m)} mi`,
        secondary: m > 0 ? (i === 0 ? 'Leading' : `${formatMiles(best - m)} off the lead`) : 'No miles yet',
        progress: best > 0 ? m / best : 0,
        moved: 0,
        ranToday: ranToday(standing),
      }));
    }

    return timeBoard(standings, goalM).map(({ standing, place, timeS, projected }) => ({
      standing,
      place,
      primary: timeS == null ? '–' : formatDuration(timeS),
      secondary: projected ? 'Projected' : 'Official',
      progress: standing.counted_distance_m / goalM,
      moved: 0,
      ranToday: ranToday(standing),
    }));
  }, [standings, raceWeek, board, goalM, before]);

  const shown = useMemo(() => {
    if (settled || !before || board !== 'race') return rows;
    // Where each runner stood at the last look, ties keeping the board's order.
    return rows
      .map((r) => ({ ...r, place: r.place == null ? null : r.place + r.moved }))
      .sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity));
  }, [rows, settled, before, board]);

  const callout = useMemo(() => {
    if (!standings || !userId) return null;
    const me = standings.find((s) => s.user_id === userId);
    if (!me) return null;

    if (board === 'week') {
      const mine = rows.find((r) => r.standing.user_id === userId);
      const leader = rows[0];
      if (!mine || !leader || leader.progress === 0) return { title: 'New week', body: 'Resets Monday' };
      if (leader.standing.user_id === userId) return { title: 'You’re leading the week', body: 'Resets Monday' };
      return { title: mine.secondary, body: `${nameOf(leader.standing)} leads · resets Monday` };
    }

    if (board === 'time') return null;
    if (me.finished_at) return { title: 'You finished', body: 'Cheer the others home' };
    const rival = rivalAhead(standings, userId);
    const typicalRunM = me.activity_count ? me.total_distance_m / me.activity_count : 0;
    if (rival) {
      return {
        title: `${formatMiles(rival.gapM)} mi behind ${nameOf(rival.standing)}`,
        body: typicalRunM > 0 && rival.gapM <= typicalRunM ? 'One run closes it' : null,
      };
    }
    const chasing = standings
      .filter((s) => s.user_id !== userId && !s.finished_at)
      .sort((a, b) => b.counted_distance_m - a.counted_distance_m)[0];
    return chasing
      ? {
          title: 'You’re in front',
          body: `${nameOf(chasing)} is ${formatMiles(me.counted_distance_m - chasing.counted_distance_m)} mi back`,
        }
      : null;
  }, [standings, rows, board, userId]);

  const ranTodayNames = rows.filter((r) => r.ranToday && r.standing.user_id !== userId).map((r) => nameOf(r.standing));

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: Space.md, gap: Space.md }}>
        <Text variant="heading" size={28}>
          Leaderboard
        </Text>
        <Segmented options={BOARDS} value={board} onChange={setBoard} />
      </View>
      <Animated.FlatList
        data={shown}
        itemLayoutAnimation={LinearTransition.springify().damping(18)}
        keyExtractor={(r) => r.standing.user_id}
        contentContainerStyle={{ paddingHorizontal: Space.md, gap: Space.sm, paddingBottom: Space.xxl * 2 }}
        onRefresh={() => {
          refreshStandings();
          refreshWeek();
        }}
        refreshing={false}
        ListHeaderComponent={
          <View style={{ gap: Space.sm }}>
            {recap && before && userId && (
              <SinceLastLook recap={recap} me={standings?.find((s) => s.user_id === userId)} />
            )}
            {callout && (
              <Card style={{ borderColor: colors.accent, borderWidth: 2 }}>
                <Text variant="heading">{callout.title}</Text>
                {callout.body && <Text variant="muted">{callout.body}</Text>}
              </Card>
            )}
            {ranTodayNames.length > 0 && (
              <Text variant="muted" size={14} style={{ paddingHorizontal: Space.xs }}>
                {ranTodayNames.length <= 3
                  ? `${ranTodayNames.join(', ')} ran today`
                  : `${ranTodayNames.length} others ran today`}
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <LeaderRow row={item} isMe={item.standing.user_id === userId} movedSince={before ? 'you last looked' : 'this morning'} />
        )}
        ListEmptyComponent={
          <Text variant="muted" style={{ textAlign: 'center', marginTop: Space.xl }}>
            No runs yet
          </Text>
        }
      />
    </SafeAreaView>
  );
}

function LeaderRow({ row, isMe, movedSince }: { row: Row; isMe: boolean; movedSince: string }) {
  const { colors } = useTheme();
  const medal = row.place != null && row.place <= 3 ? Medal[row.place as 1 | 2 | 3] : null;
  return (
    <Card style={isMe ? { borderColor: colors.accent, borderWidth: 2 } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.md }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: medal ?? colors.surfaceAlt,
          }}>
          <Text variant="display" size={18} style={{ color: medal ? '#1C1433' : colors.text }}>
            {row.place ?? '·'}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.sm }}>
            <Text style={{ fontWeight: '800', flexShrink: 1 }} numberOfLines={1}>
              {nameOf(row.standing)}
              {isMe ? ' (you)' : ''}
            </Text>
            {row.moved !== 0 && (
              <Text
                size={13}
                accessibilityLabel={`${row.moved > 0 ? 'Up' : 'Down'} ${Math.abs(row.moved)} since ${movedSince}`}
                style={{ fontWeight: '800', color: row.moved > 0 ? colors.onPace : colors.textMuted }}>
                {row.moved > 0 ? '▲' : '▼'} {Math.abs(row.moved)}
              </Text>
            )}
            {row.ranToday && (
              <View
                accessibilityLabel="Ran today"
                style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.onPace }}
              />
            )}
          </View>
          <Text variant="muted" size={13}>
            {row.secondary}
          </Text>
        </View>
        <Text variant="display" size={20}>
          {row.primary}
        </Text>
      </View>
      {/* Your bar in color, everyone else's in gray: the eye goes to where you stand. */}
      <ProgressBar progress={row.progress} height={6} muted={!isMe} />
    </Card>
  );
}
