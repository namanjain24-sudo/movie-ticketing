import {
  SEAT_TIER_LABELS,
  formatMoney,
  type EventKind,
  type SeatMap,
  type SeatMapSeat,
} from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FlatList, Pressable, StyleSheet, View, type ViewToken } from 'react-native';
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
import { gradients, spacing } from '../../theme/tokens';
import { logMountedSeatCount, startSeatmapPerfLog } from './perf-log';
import type { SeatRenderStatus, SeatRow } from './use-seat-selection';

/**
 * Geometry is fixed rather than measured. A constant pitch lets the row list
 * report a known item height, which is what keeps scrolling smooth on a large
 * auditorium: nothing has to be laid out to know where it is.
 */
export const SEAT_SIZE = 28;
export const SEAT_GAP = 6;
export const SEAT_PITCH = SEAT_SIZE + SEAT_GAP;
/**
 * The frozen gutter's width.
 *
 * A cinema row is "A" or "AA" and 28 points is ample. A stand's is not: rows
 * at Wankhede read "GP-A" for the Garware Pavilion and "MCA-F" for the MCA
 * Pavilion, because a bare "A" in a six-stand bowl says nothing about which
 * stand it is. At 28 points those wrapped onto two lines, which made every
 * row in the map taller than its seats. So the gutter is measured from the
 * labels it actually has to hold.
 */
export const ROW_LABEL_WIDTH = 28;

/** Roughly what a caption-sized character costs, plus the gutter's padding. */
export function rowLabelWidthFor(rows: { label: string }[]): number {
  const longest = rows.reduce((max, r) => Math.max(max, r.label.length), 1);
  return Math.max(ROW_LABEL_WIDTH, Math.ceil(longest * 7.5) + 8);
}
const TIER_HEADER_HEIGHT = 46;
/** Columns rendered beyond each edge, so a fast pan never shows a hole. */
const COLUMN_BUFFER = 5;

export function seatColors(status: SeatRenderStatus, colors: Colors) {
  switch (status) {
    // `primarySolid` for the fill, because the seat number sitting on it is
    // ten pixels of white and the brand red is 3.50:1 behind it. The border
    // stays the brand colour, which is what makes a chosen seat read as the
    // app's own red from across the map.
    case 'SELECTED':
      return { fill: colors.primarySolid, border: colors.primary, label: colors.onPrimary };
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
  labelWidth,
  onPress,
}: {
  seat: SeatMapSeat;
  status: SeatRenderStatus;
  labelWidth: number;
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
    left: labelWidth + seat.x * SEAT_PITCH,
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
      // A couple of px, not more: the 6px gap between seats leaves only so
      // much room before this would start stealing a neighbor's own taps.
      hitSlop={2}
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
    labelWidth,
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
    /** Measured from the longest label in the map; see `rowLabelWidthFor`. */
    labelWidth: number;
    /** Horizontal offset, so the row can pin its label to the viewport edge. */
    scrollX: SharedValue<number>;
    onPressSeat: (seat: SeatMapSeat) => void;
  }) {
    const { colors } = useTheme();
    const labelStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: scrollX.value }],
    }));
    /**
     * The gutter's edge earns its line only once seats are actually passing
     * behind it. Drawn at rest it would be a rule down the left of a map that
     * has nothing to divide.
     */
    const edgeStyle = useAnimatedStyle(() => ({
      opacity: Math.min(1, scrollX.value / 24),
    }));

    return (
      <View style={styles.row}>
        {row.seats.map((seat, index) =>
          seat.x >= firstColumn && seat.x <= lastColumn ? (
            <Seat
              key={seat.id}
              seat={seat}
              status={statuses[index]}
              labelWidth={labelWidth}
              onPress={onPressSeat}
            />
          ) : null,
        )}

        {/*
          Pinned to the viewport's left edge: on a 62-column house the labels
          would otherwise be the first thing to scroll out of reach.

          Painted last, and opaque, on purpose. Absolutely positioned siblings
          stack in source order, so with the label first every seat scrolled
          past it came out on top of it: row C under seat 7 read as "C7", a
          letter and a number occupying the same twenty-eight pixels. It is a
          frozen column, so it has to behave like one and have the seats go
          behind it. The backdrop reaches back over the scroller's own left
          padding too, or a sliver of seat would show in the gutter beside it.
        */}
        <Animated.View
          style={[
            styles.label,
            { backgroundColor: colors.background, width: labelWidth + spacing.lg },
            labelStyle,
          ]}
        >
          <Text variant="caption" numberOfLines={1} style={{ color: colors.textMuted }}>
            {row.label}
          </Text>
          <Animated.View
            style={[styles.labelEdge, { backgroundColor: colors.border }, edgeStyle]}
          />
        </Animated.View>
      </View>
    );
  },
  (prev, next) =>
    prev.row === next.row &&
    prev.signature === next.signature &&
    prev.firstColumn === next.firstColumn &&
    prev.lastColumn === next.lastColumn &&
    prev.labelWidth === next.labelWidth &&
    prev.onPressSeat === next.onPressSeat,
);

/**
 * What this block of rows costs, pinned to the viewport like the row labels.
 *
 * It used to be laid out across the full content width, which on a sixty-two
 * column house is a little over two thousand pixels. The consequence was not
 * subtle once you looked for it: the tier's name scrolled off the left the
 * moment anyone panned, and the price — the single number that decides which
 * part of the auditorium someone picks — sat seventeen hundred pixels off the
 * right hand edge and was therefore never seen at all, on any house wider
 * than the phone.
 *
 * Pinning it costs one shared-value read per header, of which there are three
 * or four in a map, and it puts the price on screen permanently.
 */
const TierHeader = memo(function TierHeader({
  item,
  scrollX,
  viewportWidth,
}: {
  item: Extract<GridItem, { kind: 'tier' }>;
  scrollX: SharedValue<number>;
  viewportWidth: number;
}) {
  const { colors } = useTheme();
  const pinned = useAnimatedStyle(() => ({ transform: [{ translateX: scrollX.value }] }));

  return (
    <Animated.View
      style={[
        styles.tier,
        {
          height: TIER_HEADER_HEIGHT,
          backgroundColor: colors.background,
          // Until the scroller has been measured, let it lie across the
          // content as before rather than collapse to nothing.
          width: viewportWidth ? viewportWidth - spacing.lg * 2 : undefined,
        },
        pinned,
      ]}
    >
      <Text variant="overline" tone="muted">
        {item.label.toUpperCase()}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      <Text variant="label" numeric>
        {formatMoney(item.priceMinor, item.currency)}
      </Text>
    </Animated.View>
  );
});

/**
 * The curve at the top of the auditorium. Drawn rather than labelled, because
 * "which way am I facing" is a spatial question and deserves a spatial answer.
 */
/**
 * What the curve is pointing at, in the venue's own word.
 *
 * "SCREEN THIS WAY" is right in a cinema and wrong everywhere else: a cricket
 * ground has a pitch and a gig has a stage, and an arrow labelled "screen" at
 * Wankhede is the map telling somebody it does not know where it is.
 */
const FACING_LABEL: Record<EventKind | 'FILM', string> = {
  FILM: 'SCREEN THIS WAY',
  SPORT: 'PITCH THIS WAY',
  CONCERT: 'STAGE THIS WAY',
  COMEDY: 'STAGE THIS WAY',
  THEATRE: 'STAGE THIS WAY',
  WORKSHOP: 'FRONT OF ROOM',
};

export function ScreenCurve({ facing = 'FILM' }: { facing?: EventKind | 'FILM' }) {
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
      <Text variant="overline" tone="muted" style={{ marginTop: spacing['2xs'] }}>
        {FACING_LABEL[facing]}
      </Text>
    </View>
  );
}

export type SeatGridHandle = {
  /** Scrolls the row list so the named row's `y` sits at the top. */
  scrollToRow: (rowY: number) => void;
};

export const SeatGrid = forwardRef<
  SeatGridHandle,
  {
    rows: SeatRow[];
    map: SeatMap;
    statusOf: (seat: SeatMapSeat) => SeatRenderStatus;
    onPressSeat: (seat: SeatMapSeat) => void;
    /** Fed from the list's own viewability, for a "Row X" orientation chip. */
    onVisibleRowChange?: (label: string) => void;
  }
>(function SeatGrid({ rows, map, statusOf, onPressSeat, onVisibleRowChange }, ref) {
  const { spacing } = useTheme();

  /**
   * Rows are grouped into priced tier sections, because that is the order a
   * person actually decides in: budget first, position second. One pass over
   * every seat gives each row a short signature to memo against, which is far
   * cheaper than re-rendering a two-thousand-seat map on every tap. The same
   * pass records which list index each row landed at, so a jump-to-row only
   * has to look up a number rather than re-scan the list.
   */
  const { items, rowItemIndex } = useMemo(() => {
    const priceOf = new Map(map.tiers.map((t) => [t.tier, t]));
    const out: GridItem[] = [];
    const rowIndex = new Map<number, number>();
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
      rowIndex.set(row.y, out.length);
      out.push({
        kind: 'row',
        key: `row-${row.y}`,
        row,
        statuses,
        signature: statuses.join(''),
      });
    }
    return { items: out, rowItemIndex: rowIndex };
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

  // Measured from the labels this map actually has: "A" at a cinema, "MCA-F"
  // at a ground with six stands.
  const labelWidth = useMemo(() => rowLabelWidthFor(rows), [rows]);
  const contentWidth = labelWidth + map.screen.columnCount * SEAT_PITCH;

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

  useEffect(startSeatmapPerfLog, []);
  useEffect(() => {
    const visibleRows = Math.ceil((frame.height || 600) / SEAT_PITCH);
    logMountedSeatCount(visibleRows, lastColumn - firstColumn);
  }, [frame.height, firstColumn, lastColumn]);

  const flatListRef = useRef<FlatList<GridItem>>(null);
  useImperativeHandle(
    ref,
    () => ({
      scrollToRow: (rowY) => {
        const index = rowItemIndex.get(rowY);
        if (index === undefined) return;
        flatListRef.current?.scrollToOffset({ offset: offsets.starts[index], animated: true });
      },
    }),
    [rowItemIndex, offsets],
  );

  // Kept in a ref rather than a dependency of `onViewableItemsChanged`: that
  // prop (and `viewabilityConfig`) must keep one identity for the life of the
  // list, or FlatList throws. The callback itself can still read the latest
  // `onVisibleRowChange` through the ref — set from an effect, never during
  // render, since a ref write belongs outside the render phase.
  const onVisibleRowChangeRef = useRef(onVisibleRowChange);
  useEffect(() => {
    onVisibleRowChangeRef.current = onVisibleRowChange;
  }, [onVisibleRowChange]);
  const [viewabilityConfig] = useState({ itemVisiblePercentThreshold: 0 });
  const [onViewableItemsChanged] = useState(
    () =>
      ({ viewableItems }: { viewableItems: ViewToken<GridItem>[] }) => {
        const firstRow = viewableItems.find((v) => v.item.kind === 'row');
        if (firstRow && firstRow.item.kind === 'row') {
          onVisibleRowChangeRef.current?.(firstRow.item.row.label);
        }
      },
  );

  const renderItem = useCallback(
    ({ item }: { item: GridItem }) => {
      if (item.kind === 'tier') {
        return <TierHeader item={item} scrollX={scrollX} viewportWidth={frame.width} />;
      }
      return (
        <Row
          row={item.row}
          statuses={item.statuses}
          signature={item.signature}
          firstColumn={firstColumn}
          lastColumn={lastColumn}
          labelWidth={labelWidth}
          scrollX={scrollX}
          onPressSeat={onPressSeat}
        />
      );
    },
    [frame.width, firstColumn, lastColumn, labelWidth, scrollX, onPressSeat],
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
          ref={flatListRef}
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
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
        />
      </View>
    </Animated.ScrollView>
  );
});

const styles = StyleSheet.create({
  row: { height: SEAT_PITCH, justifyContent: 'center' },
  label: {
    position: 'absolute',
    // Back over the scroller's own left padding, so no sliver of a
    // scrolled-past seat shows in the gutter beside the letter.
    left: -spacing.lg,
    top: 0,
    bottom: 0,
    paddingLeft: spacing.lg,
    justifyContent: 'center',
  },
  labelEdge: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
  },
  tier: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
