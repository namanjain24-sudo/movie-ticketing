import { SEAT_TIER_LABELS, formatMoney, type SeatMap, type SeatMapSeat } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  ZoomIn,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '../../components/ui';
import { useTheme, type Colors } from '../../theme';
import { gradients } from '../../theme/tokens';
import type { SeatRenderStatus, SeatRow } from './use-seat-selection';

/**
 * Geometry is fixed rather than measured. A constant pitch lets the row list
 * report a known item height, which is what keeps scrolling smooth on a large
 * auditorium: nothing has to be laid out to know where it is.
 */
export const SEAT_SIZE = 26;
export const SEAT_GAP = 5;
export const SEAT_PITCH = SEAT_SIZE + SEAT_GAP;
export const ROW_LABEL_WIDTH = 28;
const TIER_HEADER_HEIGHT = 46;
/** Columns rendered beyond each edge, so a fast pan never shows a hole. */
const COLUMN_BUFFER = 5;

export function seatColors(status: SeatRenderStatus, colors: Colors) {
  switch (status) {
    case 'SELECTED':
      return { fill: colors.primary, border: colors.primary, label: colors.onPrimary };
    case 'HELD_BY_YOU':
      return { fill: colors.primaryMuted, border: colors.primary, label: colors.primary };
    case 'AVAILABLE':
      return { fill: colors.seatFree, border: colors.seatFreeBorder, label: colors.textMuted };
    // Sold, held by someone else and blocked are one thing to the eye. The
    // difference matters to the server, not to a person choosing a seat.
    default:
      return { fill: colors.seatGone, border: colors.seatGone, label: 'transparent' };
  }
}

type GridItem =
  | { kind: 'tier'; key: string; label: string; priceMinor: number; currency: string }
  | { kind: 'row'; key: string; row: SeatRow; statuses: SeatRenderStatus[]; signature: string };

/**
 * The body of a seat. Deliberately hook-free so the unselected ones — up to six
 * hundred of them on the IMAX map — cost nothing beyond a View.
 */
function SeatBody({
  seat,
  palette,
}: {
  seat: SeatMapSeat;
  palette: ReturnType<typeof seatColors>;
}) {
  return seat.accessible ? (
    <Ionicons name="accessibility" size={13} color={palette.label} />
  ) : (
    <Text variant="caption" numeric style={{ fontSize: 10, color: palette.label }}>
      {seat.number}
    </Text>
  );
}

const Seat = memo(function Seat({
  seat,
  status,
  onPress,
}: {
  seat: SeatMapSeat;
  status: SeatRenderStatus;
  onPress: (seat: SeatMapSeat) => void;
}) {
  const { colors, radius } = useTheme();
  const palette = seatColors(status, colors);
  const selectable = status === 'AVAILABLE' || status === 'SELECTED' || status === 'HELD_BY_YOU';
  const selected = status === 'SELECTED';

  const box = {
    // Placed by its own grid coordinate, which is what preserves the
    // auditorium's aisles, its centring, and the taper towards the screen.
    position: 'absolute' as const,
    left: ROW_LABEL_WIDTH + seat.x * SEAT_PITCH,
    width: SEAT_SIZE,
    height: SEAT_SIZE,
    // A seat is a seat: square at the back, rounded at the front edge.
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.fill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  const content = <SeatBody seat={seat} palette={palette} />;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !selectable }}
      accessibilityLabel={`Row ${seat.rowLabel} seat ${seat.number}${
        seat.accessible ? ', wheelchair accessible' : ''
      }${selectable ? '' : ', unavailable'}`}
      disabled={!selectable}
      onPress={() => onPress(seat)}
      style={box}
    >
      {/*
        Only the chosen seat animates. A shared value per seat would mean six
        hundred of them on a full house; keying the spring to the selected
        variant means at most ten exist at once, and the seat still grows and
        settles under the thumb the way the design says it should.
      */}
      {selected ? (
        <Animated.View
          key="selected"
          entering={ZoomIn.springify().damping(11).stiffness(180)}
          style={{ alignItems: 'center', justifyContent: 'center' }}
        >
          {content}
        </Animated.View>
      ) : (
        content
      )}
    </Pressable>
  );
});

const Row = memo(
  function Row({
    row,
    statuses,
    firstColumn,
    lastColumn,
    scrollX,
    onPressSeat,
  }: {
    row: SeatRow;
    /** One status per seat, in the row's own order. */
    statuses: SeatRenderStatus[];
    /** Signature of `statuses`; memo compares this, not the array. */
    signature: string;
    firstColumn: number;
    lastColumn: number;
    /** Horizontal offset, so the row can pin its label to the viewport edge. */
    scrollX: SharedValue<number>;
    onPressSeat: (seat: SeatMapSeat) => void;
  }) {
    const { colors } = useTheme();
    const labelStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: scrollX.value }],
    }));

    return (
      <View style={styles.row}>
        {/* Pinned to the viewport's left edge: on a 62-column house the labels
            would otherwise be the first thing to scroll out of reach. */}
        <Animated.View style={[styles.label, labelStyle]}>
          <Text variant="caption" style={{ color: colors.textMuted }}>
            {row.label}
          </Text>
        </Animated.View>

        {row.seats.map((seat, index) =>
          seat.x >= firstColumn && seat.x <= lastColumn ? (
            <Seat key={seat.id} seat={seat} status={statuses[index]} onPress={onPressSeat} />
          ) : null,
        )}
      </View>
    );
  },
  (prev, next) =>
    prev.row === next.row &&
    prev.signature === next.signature &&
    prev.firstColumn === next.firstColumn &&
    prev.lastColumn === next.lastColumn &&
    prev.onPressSeat === next.onPressSeat,
);

/**
 * The curve at the top of the auditorium. Drawn rather than labelled, because
 * "which way am I facing" is a spatial question and deserves a spatial answer.
 */
export function ScreenCurve() {
  const { colors, spacing } = useTheme();

  return (
    <View style={{ alignItems: 'center', paddingBottom: spacing.lg }}>
      <View style={{ width: '72%', height: 44 }}>
        {/* The projector's light, thrown down from the screen onto the seats.
            Drawn first so the arc sits on top of it. */}
        <LinearGradient
          colors={gradients.projector}
          style={{
            position: 'absolute',
            top: 0,
            left: '4%',
            right: '4%',
            height: 44,
            borderTopLeftRadius: 120,
            borderTopRightRadius: 120,
          }}
          pointerEvents="none"
        />
        <View
          style={{
            width: '100%',
            height: 26,
            borderTopWidth: 3,
            borderColor: colors.accent,
            borderTopLeftRadius: 120,
            borderTopRightRadius: 120,
          }}
        />
      </View>
      <Text variant="overline" tone="muted" style={{ marginTop: 2 }}>
        SCREEN THIS WAY
      </Text>
    </View>
  );
}

export function SeatGrid({
  rows,
  map,
  statusOf,
  onPressSeat,
}: {
  rows: SeatRow[];
  map: SeatMap;
  statusOf: (seat: SeatMapSeat) => SeatRenderStatus;
  onPressSeat: (seat: SeatMapSeat) => void;
}) {
  const { colors, spacing } = useTheme();

  /**
   * Rows are grouped into priced tier sections, because that is the order a
   * person actually decides in: budget first, position second. One pass over
   * every seat gives each row a short signature to memo against, which is far
   * cheaper than re-rendering a two-thousand-seat map on every tap.
   */
  const items = useMemo<GridItem[]>(() => {
    const priceOf = new Map(map.tiers.map((t) => [t.tier, t]));
    const out: GridItem[] = [];
    let openTier: string | null = null;

    for (const row of rows) {
      const tier = row.seats[0]?.tier;
      if (tier && tier !== openTier) {
        const info = priceOf.get(tier);
        out.push({
          kind: 'tier',
          key: `tier-${tier}-${row.y}`,
          label: info?.label ?? SEAT_TIER_LABELS[tier],
          priceMinor: info?.priceMinor ?? row.seats[0].priceMinor,
          currency: map.currency,
        });
        openTier = tier;
      }
      const statuses = row.seats.map(statusOf);
      out.push({
        kind: 'row',
        key: `row-${row.y}`,
        row,
        statuses,
        signature: statuses.join(''),
      });
    }
    return out;
  }, [rows, map, statusOf]);

  const offsets = useMemo(() => {
    const heights = items.map((i) => (i.kind === 'tier' ? TIER_HEADER_HEIGHT : SEAT_PITCH));
    const starts: number[] = [];
    let acc = 0;
    for (const h of heights) {
      starts.push(acc);
      acc += h;
    }
    return { heights, starts };
  }, [items]);

  const contentWidth = ROW_LABEL_WIDTH + map.screen.columnCount * SEAT_PITCH;

  /**
   * The row list needs its viewport in real pixels. `flex: 1` is not enough
   * inside a horizontal scroller's content container, where there is no bounded
   * height to flex against.
   */
  const [frame, setFrame] = useState({ width: 0, height: 0 });

  /**
   * Windowing the other way round. Virtualising rows alone does nothing for a
   * house that is 34 rows deep and 62 columns wide: every row is on screen, so
   * every one of its seats would mount. Tracking the horizontal offset lets a
   * row draw only the columns actually in view.
   */
  const scrollX = useSharedValue(0);
  const [firstVisible, setFirstVisible] = useState(0);
  const onColumnChange = useCallback((col: number) => setFirstVisible(col), []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
      // Only cross into JS when the window actually moves by a whole column,
      // so a smooth pan is not a storm of re-renders.
      const col = Math.floor(event.contentOffset.x / SEAT_PITCH);
      runOnJS(onColumnChange)(col);
    },
  });

  const columnsInView = Math.ceil((frame.width || 400) / SEAT_PITCH);
  const firstColumn = Math.max(0, firstVisible - COLUMN_BUFFER);
  const lastColumn = firstVisible + columnsInView + COLUMN_BUFFER;

  const renderItem = useCallback(
    ({ item }: { item: GridItem }) => {
      if (item.kind === 'tier') {
        return (
          <View style={[styles.tier, { height: TIER_HEADER_HEIGHT }]}>
            <Text variant="overline" tone="muted">
              {item.label.toUpperCase()}
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <Text variant="label" numeric>
              {formatMoney(item.priceMinor, item.currency)}
            </Text>
          </View>
        );
      }
      return (
        <Row
          row={item.row}
          statuses={item.statuses}
          signature={item.signature}
          firstColumn={firstColumn}
          lastColumn={lastColumn}
          scrollX={scrollX}
          onPressSeat={onPressSeat}
        />
      );
    },
    [colors.border, firstColumn, lastColumn, scrollX, onPressSeat],
  );

  return (
    <Animated.ScrollView
      horizontal
      style={{ flex: 1 }}
      showsHorizontalScrollIndicator={false}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      onLayout={(e) =>
        setFrame({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
      }
      contentContainerStyle={{ paddingHorizontal: spacing.lg }}
    >
      <View style={{ width: contentWidth, height: frame.height || undefined }}>
        <FlatList
          style={{ flex: 1 }}
          data={items}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          getItemLayout={(_, index) => ({
            length: offsets.heights[index],
            offset: offsets.starts[index],
            index,
          })}
          initialNumToRender={14}
          maxToRenderPerBatch={8}
          windowSize={3}
          removeClippedSubviews
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
        />
      </View>
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { height: SEAT_PITCH, justifyContent: 'center' },
  label: { position: 'absolute', left: 0, width: ROW_LABEL_WIDTH },
  tier: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
