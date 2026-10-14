import { memo, useEffect, useState } from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { Sunrise } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const COLUMNS = 40;
/** Gap between tiles, as a share of a tile's width. */
const GAP = 0.22;
/** How long the new tiles take to light up, however many there are. */
const REVEAL_MS = 1400;

/**
 * The whole race as a wall of tiles, one per mile. Miles run are filled; the miles a run
 * just added light up one at a time in a second color. A thousand countable tiles shows
 * progress at 1% in a way a ring or a bar can't.
 */
export function MileWall({
  goalMiles,
  filledMiles,
  freshMiles = 0,
  animate = false,
}: {
  goalMiles: number;
  /** Whole miles done, including any fresh ones. */
  filledMiles: number;
  /** How many of the most recent filled tiles to highlight as just earned. */
  freshMiles?: number;
  /** Light the fresh tiles up one by one instead of showing them at once. */
  animate?: boolean;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const total = Math.max(1, Math.round(goalMiles));
  const filled = Math.min(total, Math.max(0, Math.floor(filledMiles)));
  const fresh = Math.min(filled, Math.max(0, Math.round(freshMiles)));
  const settled = filled - fresh;

  const [shown, setShown] = useState(animate ? 0 : fresh);
  useEffect(() => {
    if (!animate || fresh === 0) return setShown(fresh);
    setShown(0);
    let n = 0;
    const timer = setInterval(() => {
      n += 1;
      setShown(n);
      if (n >= fresh) clearInterval(timer);
    }, Math.max(24, REVEAL_MS / fresh));
    return () => clearInterval(timer);
  }, [animate, fresh, settled]);

  const pitch = width / COLUMNS;
  const size = pitch * (1 - GAP);
  const rows = Math.ceil(total / COLUMNS);

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${filled.toLocaleString()} of ${total.toLocaleString()} miles done${fresh ? `, ${fresh} of them just now` : ''}.`}
      style={{ height: width ? rows * pitch : undefined, minHeight: width ? undefined : 120 }}>
      {width > 0 && (
        <Svg width={width} height={rows * pitch}>
          <Tiles from={0} to={total} pitch={pitch} size={size} color={colors.track} />
          <Tiles from={0} to={settled} pitch={pitch} size={size} color={colors.accent} />
          <Tiles from={settled} to={settled + shown} pitch={pitch} size={size} color={Sunrise[2]} />
        </Svg>
      )}
    </View>
  );
}

/** A run of tiles. Memoized so lighting up a few new ones doesn't redraw the other thousand. */
const Tiles = memo(function Tiles({
  from,
  to,
  pitch,
  size,
  color,
}: {
  from: number;
  to: number;
  pitch: number;
  size: number;
  color: string;
}) {
  const tiles = [];
  for (let i = from; i < to; i++) {
    tiles.push(
      <Rect
        key={i}
        x={(i % COLUMNS) * pitch}
        y={Math.floor(i / COLUMNS) * pitch}
        width={size}
        height={size}
        rx={size * 0.22}
        fill={color}
      />,
    );
  }
  return <>{tiles}</>;
});
