import {
  EVENT_KIND_SINGULAR,
  SHOW_FORMAT_LABELS,
  formatMoney,
  type SeatMapSeat,
} from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bookingApi, seatConflictFrom } from '../../api/booking';
import { catalogApi } from '../../api/catalog';
import { ApiRequestError } from '../../api/client';
import { ErrorState, LoadingState } from '../../components/query-state';
import { AppBar, Button, Text } from '../../components/ui';
import { SeatLegend } from '../../features/seatmap/legend';
import { findBestSeats } from '../../features/seatmap/best-seats';
import { SeatCountSheet } from '../../features/seatmap/seat-count-sheet';
import { ScreenCurve, SeatGrid, type SeatGridHandle } from '../../features/seatmap/seat-grid';
import { SeatOverview } from '../../features/seatmap/seat-overview';
import { useSeatSelection } from '../../features/seatmap/use-seat-selection';
import { formatMonthDay, formatTime } from '../../lib/format';
import { rejectFeedback, successFeedback, tapFeedback } from '../../lib/haptics';
import { idempotencyKey } from '../../lib/idempotency';
import { queryKeys } from '../../lib/query-client';
import { useTheme } from '../../theme';
import { subjectTitle } from '../../features/catalog/subject';

export default function SeatMapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, spacing, elevation } = useTheme();
  const insets = useSafeAreaInsets();
  const [holdError, setHoldError] = useState<string | null>(null);
  const [partySize, setPartySize] = useState<number | undefined>(undefined);
  const [askedPartySize, setAskedPartySize] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [visibleRow, setVisibleRow] = useState<string | null>(null);
  const gridRef = useRef<SeatGridHandle>(null);

  const seatMap = useQuery({
    queryKey: queryKeys.seatMap(id),
    queryFn: () => catalogApi.seatMap(id),
    enabled: Boolean(id),
    // The map is a snapshot the moment it lands; refetching on focus is the
    // difference between a stale map and one that is merely seconds old.
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });

  const selection = useSeatSelection(seatMap.data, partySize);

  /**
   * A seat tap, behind a handler whose identity never changes.
   *
   * `SeatGrid` is built to avoid re-rendering seats that did not change:
   * `Seat` and `Row` are both memoised, and `Row`'s comparator comes down to
   * `prev.onPressSeat === next.onPressSeat`. An inline arrow here failed that
   * comparison on every render, so all of it did nothing: one tap re-rendered
   * roughly 380 seats on a 524-seat house, and so did every row boundary
   * crossed while scrolling, which is exactly when frames are scarcest.
   *
   * A plain `useCallback` is not enough, because `selection.toggle` is itself
   * a new function after every tap. Holding the live body in a ref and handing
   * out a fixed wrapper keeps the identity stable without going stale.
   *
   * The ref is refreshed in an effect rather than during render: a ref write
   * while rendering is the thing `react-hooks/refs` forbids, and the gap costs
   * nothing here because the only caller is a press, which cannot happen
   * between a render and its effects.
   */
  const onPressRef = useRef<(seat: SeatMapSeat) => void>(() => {});
  useEffect(() => {
    onPressRef.current = (seat) => {
      setHoldError(null);
      // The rules live in the hook; the feedback follows what it decided, so a
      // refused tap never feels the same as an accepted one.
      const accepted = selection.toggle(seat);
      if (accepted) tapFeedback();
      else rejectFeedback();
    };
  });
  const onPressSeat = useCallback((seat: SeatMapSeat) => onPressRef.current(seat), []);

  /**
   * One key per attempt at the same seats. It survives a failed request so a
   * retry replays rather than claiming a second hold, and is minted again only
   * when the selection changes underneath it.
   */
  const keyRef = useRef<string | null>(null);
  const keyForRef = useRef<string>('');

  const hold = useMutation({
    mutationFn: (showSeatIds: string[]) => {
      const fingerprint = [...showSeatIds].sort().join(',');
      if (keyRef.current === null || keyForRef.current !== fingerprint) {
        keyRef.current = idempotencyKey('hold');
        keyForRef.current = fingerprint;
      }
      return bookingApi.createHold(id, { showSeatIds }, keyRef.current);
    },
    onSuccess: (created) => {
      keyRef.current = null;
      successFeedback();
      router.push(`/checkout/${created.id}`);
    },
    onError: (error) => {
      rejectFeedback();
      const conflict = seatConflictFrom(error);
      if (conflict) {
        // Grey the lost seats out in place and reload the map underneath, so
        // the user fixes their choice on the screen they are already on.
        selection.markUnavailable(conflict.unavailableShowSeatIds);
        void seatMap.refetch();
        setHoldError('Someone took those seats first. They are greyed out now.');
        return;
      }
      if (error instanceof ApiRequestError && error.code === 'SEATS_CONTENDED') {
        setHoldError('Those seats are busy right now. Try again in a moment.');
        return;
      }
      setHoldError(
        error instanceof ApiRequestError ? error.message : 'Could not hold those seats.',
      );
    },
  });

  if (seatMap.isPending) return <LoadingState label="Loading seats" />;

  if (seatMap.isError || !seatMap.data) {
    return (
      <ErrorState
        error={seatMap.error}
        title="Could not load the seat map"
        onRetry={() => void seatMap.refetch()}
      />
    );
  }

  const map = seatMap.data;
  const salesClosed = new Date(map.salesCloseAt).getTime() <= new Date(map.serverTime).getTime();
  const count = selection.selectedSeats.length;
  /** How many the auto-pick looks for: what they said, else a pair. */
  const wanted = Math.min(partySize ?? 2, map.maxSeatsPerBooking);

  const message = salesClosed
    ? 'Booking has closed for this screening.'
    : holdError
      ? holdError
      : selection.rejection === 'LIMIT'
        ? `You can book up to ${selection.maxSeats} seats at once.`
        : selection.rejection === 'UNAVAILABLE'
          ? 'That seat is no longer available.'
          : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppBar
        title={subjectTitle(map)}
        subtitle={`${map.cinema.name} · ${map.screen.name}`}
        titleLines={2}
        onBack={() => router.back()}
        actions={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="See the whole screen's seating at a glance"
              hitSlop={8}
              onPress={() => setOverviewOpen(true)}
            >
              <Ionicons name="grid-outline" size={20} color={colors.onChrome} />
            </Pressable>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="caption" tone="onChrome" numeric>
                {formatMonthDay(map.startsAt)}
              </Text>
              <Text variant="caption" style={{ color: colors.onChromeMuted }} numeric>
                {/* A match is not in 2D. The format column is a film's, and
                    carries a default that means nothing for an event, so the
                    event's own kind goes here instead. */}
                {formatTime(map.startsAt)} ·{' '}
                {map.event ? EVENT_KIND_SINGULAR[map.event.kind] : SHOW_FORMAT_LABELS[map.format]}
              </Text>
            </View>
          </View>
        }
      />

      <SeatCountSheet
        visible={seatMap.isSuccess && !askedPartySize}
        max={map.maxSeatsPerBooking}
        onSelect={(count) => {
          setPartySize(count);
          setAskedPartySize(true);
        }}
        onClose={() => setAskedPartySize(true)}
      />

      <View style={{ flex: 1, paddingTop: spacing.lg }}>
        {/* Outside the horizontal scroller: on a wide auditorium a centred
            label inside it would sit off-screen until the user panned. */}
        <ScreenCurve facing={map.event?.kind ?? 'FILM'} />
        {visibleRow ? (
          <View
            style={{
              position: 'absolute',
              top: spacing.lg,
              right: spacing.lg,
              zIndex: 1,
              paddingHorizontal: spacing.sm,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: colors.surfaceMuted,
            }}
          >
            <Text variant="caption" tone="muted">
              Row {visibleRow}
            </Text>
          </View>
        ) : null}
        <SeatGrid
          ref={gridRef}
          rows={selection.rows}
          map={map}
          statusOf={selection.statusOf}
          onVisibleRowChange={setVisibleRow}
          onPressSeat={onPressSeat}
        />
      </View>

      <SeatOverview
        visible={overviewOpen}
        rows={selection.rows}
        statusOf={selection.statusOf}
        columnCount={map.screen.columnCount}
        onClose={() => setOverviewOpen(false)}
        onJumpToRow={(rowY) => gridRef.current?.scrollToRow(rowY)}
      />

      <SeatLegend />

      <View
        style={[
          {
            backgroundColor: colors.surface,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: insets.bottom + spacing.md,
            gap: spacing.sm,
          },
          elevation.raised,
        ]}
      >
        {message ? (
          <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
            {message}
          </Text>
        ) : null}

        {count === 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text variant="caption" tone="muted" align="center">
              {partySize
                ? `Pick ${partySize} seat${partySize === 1 ? '' : 's'} to continue`
                : `Pick up to ${map.maxSeatsPerBooking} seats to continue`}
            </Text>
            {salesClosed ? null : (
              <Button
                label={`Best ${wanted} seat${wanted === 1 ? '' : 's'} for me`}
                variant="secondary"
                onPress={() => {
                  const best = findBestSeats(
                    selection.rows,
                    selection.statusOf,
                    wanted,
                    map.screen.columnCount,
                  );
                  if (best) {
                    setHoldError(null);
                    selection.selectSeats(best);
                    successFeedback();
                  } else {
                    rejectFeedback();
                    setHoldError(
                      `No ${wanted} seats together are free. Pick them one by one, or try another showing.`,
                    );
                  }
                }}
              />
            )}
          </View>
        ) : (
          // The bar only becomes an action once there is something to act on.
          <Animated.View entering={FadeInDown.duration(180)} style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text variant="label">
                  {count} seat{count === 1 ? '' : 's'}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {selection.selectedSeats.map((s) => `${s.rowLabel}${s.number}`).join(', ')}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="heading" numeric>
                  {formatMoney(selection.subtotalMinor, map.currency)}
                </Text>
                <Text variant="caption" tone="muted">
                  plus booking fee
                </Text>
              </View>
            </View>

            <Button
              label={salesClosed ? 'Booking closed' : 'Proceed to pay'}
              emphasis="commit"
              disabled={salesClosed}
              loading={hold.isPending}
              onPress={() => {
                setHoldError(null);
                hold.mutate(selection.selectedIds);
              }}
            />
          </Animated.View>
        )}
      </View>
    </View>
  );
}
