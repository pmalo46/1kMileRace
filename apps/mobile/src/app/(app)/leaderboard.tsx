import { distanceBoard, formatDuration, formatMiles, timeBoard } from '@1k/core';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { ProgressBar } from '@/components/progress-bar';
import { Text } from '@/components/text';
import { useActiveRace } from '@/lib/active-race';
import { useAuth } from '@/lib/auth';
import { useStandings } from '@/lib/races';
import type { Standing } from '@/lib/types';
import { Medal, Radius, Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

type Board = 'distance' | 'time';

interface Row {
  standing: Standing;
  place: number | null;
  primary: string;
  secondary: string;
  progress: number;
}

export default function Leaderboard() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const { race } = useActiveRace();
  const { standings, refresh } = useStandings(race?.id);
  const [board, setBoard] = useState<Board>('distance');
  const goalM = race?.goal_m ?? 1;

  const rows: Row[] = useMemo(() => {
    if (!standings) return [];
    if (board === 'distance') {
      return distanceBoard(standings).map(({ standing, place, finished }) => ({
        standing,
        place,
        primary: `${formatMiles(standing.counted_distance_m)} mi`,
        secondary: finished ? 'Finished 🏁' : `${formatMiles(goalM - standing.counted_distance_m)} to go`,
        progress: standing.counted_distance_m / goalM,
      }));
    }
    return timeBoard(standings, goalM).map(({ standing, place, timeS, projected }) => ({
      standing,
      place,
      primary: timeS == null ? '–' : formatDuration(timeS),
      secondary: projected ? 'Projected at current pace' : 'Official moving time',
      progress: standing.counted_distance_m / goalM,
    }));
  }, [standings, board, goalM]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: Space.md, gap: Space.md }}>
        <Text variant="heading" size={28}>
          Leaderboard
        </Text>
        <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: Radius.pill, padding: 4 }}>
          {(['distance', 'time'] as const).map((b) => (
            <Pressable
              key={b}
              onPress={() => setBoard(b)}
              accessibilityRole="tab"
              accessibilityState={{ selected: board === b }}
              style={{
                flex: 1,
                paddingVertical: Space.sm,
                borderRadius: Radius.pill,
                alignItems: 'center',
                backgroundColor: board === b ? colors.surface : 'transparent',
              }}>
              <Text style={{ fontWeight: '800' }}>{b === 'distance' ? 'First to 1,000' : 'Fastest 1,000'}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.standing.user_id}
        contentContainerStyle={{ paddingHorizontal: Space.md, gap: Space.sm, paddingBottom: Space.xxl * 2 }}
        onRefresh={refresh}
        refreshing={false}
        renderItem={({ item }) => (
          <LeaderRow row={item} isMe={item.standing.user_id === session?.user.id} />
        )}
        ListEmptyComponent={
          <Text variant="muted" style={{ textAlign: 'center', marginTop: Space.xl }}>
            No one on the board yet. The first mile is the bravest.
          </Text>
        }
      />
    </SafeAreaView>
  );
}

function LeaderRow({ row, isMe }: { row: Row; isMe: boolean }) {
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
          <Text style={{ fontWeight: '800' }} numberOfLines={1}>
            {row.standing.profile?.display_name ?? 'Runner'}
            {isMe ? ' (you)' : ''}
          </Text>
          <Text variant="muted" size={13}>
            {row.secondary}
          </Text>
        </View>
        <Text variant="display" size={20}>
          {row.primary}
        </Text>
      </View>
      <ProgressBar progress={row.progress} height={6} />
    </Card>
  );
}
