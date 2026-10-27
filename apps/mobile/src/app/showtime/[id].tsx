import {
  EVENT_KIND_SINGULAR,
  SHOW_FORMAT_LABELS,
  formatMoney,
  type SeatMapSeat,
  type SeatTier,
} from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { SeatGrid, type SeatGridHandle } from '../../features/seatmap/seat-grid';
import { AccessibleSeats } from '../../features/seatmap/accessible-seats';
import { StadiumBowl } from '../../features/seatmap/stadium-bowl';
import { StandPicker, summariseStands } from '../../features/seatmap/stand-picker';
import { VenueFacing } from '../../features/seatmap/venue-facing';
import { SeatOverview } from '../../features/seatmap/seat-overview';
import { useSeatSelection } from '../../features/seatmap/use-seat-selection';
import { formatMonthDay, formatTime, joinWords } from '../../lib/format';
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
    /**
     * And refetching on a timer is the difference between either of those and
     * a map that is simply wrong. Focus is the only thing that refreshed this
     * screen, and focus does not fire while somebody sits on it reading a
     * five-hundred-seat room — which is the entire time it matters. Holds last
     * five minutes and the sweeper returns the expired ones continuously, so
     * the room genuinely changes underneath a selection that takes a minute to
     * make. The first the person heard of it was the hold being refused.
     *
     * Twenty seconds: a fifteenth of a hold's life, and about 7KB a turn for
     * the forty-seat rooms up to roughly 50KB for the largest. It stops when
     * the screen is unmounted, stops when the app is backgrounded (React Query
     * does not poll in the background by default) and stops below, for good,
     * once a snapshot reports the window shut.
     */
    refetchInterval: (query) => {
      const map = query.state.data;
      if (!map) return false;
      // Judged against the server's own clock, as the banner below is, so a
      // device with a wrong time cannot decide this either way. Each poll
      // brings a fresh `serverTime`, so a window that shuts while the screen
      // is open is noticed on the next turn and the polling then stops.
      const closed = new Date(map.salesCloseAt).getTime() <= new Date(map.serverTime).getTime();
      return closed ? false : 20_000;
    },
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

  /**
   * Both of these live above the loading guard. Called below it they would be
   * hooks that only run once the query has settled, and the hook order would
   * change on the render that loads the map — which is the one rule React has
   * no way to recover from.
   */
  const rows = selection.rows;

  /**
   * The stand the person picked, if they picked one.
   *
   * It is not decoration. "Best seats for me" searches the rows it is given,
   * and given all of them it will happily answer a tap on the ₹600 end with
   * two seats in the ₹6,000 Club House — ten times the price somebody just
   * said they wanted. Choosing a stand narrows that search to it.
   */
  const [chosenTier, setChosenTier] = useState<SeatTier | null>(null);

  /** Send the seat list to the first row of a stand, from plan or from list. */
  const jumpToStand = useCallback(
    (tier: SeatTier) => {
      setChosenTier(tier);
      const row = rows.find((r) => r.seats.some((seat) => seat.tier === tier));
      if (row) gridRef.current?.scrollToRow(row.y);
    },
    [rows],
  );

  /**
   * Price and what is left in each stand. Counted from the seats already in
   * hand rather than asked of the server: a second number from a second
   * source is a number that can disagree with the map under it.
   */
  const tiers = seatMap.data?.tiers;
  const allSeats = seatMap.data?.seats;
  const isEvent = Boolean(seatMap.data?.event);
  const statusOf = selection.statusOf;
  const stands = useMemo(
    // Every event, not only the ones shaped like a bowl. A concert in a hall
    // and a workshop in a studio are sold the same way a match is — pick the
    // band, then the seat — and those venues have no ring to draw, so without
    // this they were the only places that still opened on a bare grid.
    //
    // A film is not on this list. A cinema's bands are Standard, Premium and
    // Recliner, every seat faces the same screen, and the row you are in is
    // the decision. Asking a cinema-goer to choose a category first would be
    // a step that answers nothing.
    () => (tiers && allSeats && isEvent ? summariseStands(tiers, allSeats, statusOf) : []),
    [tiers, allSeats, isEvent, statusOf],
  );

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

  /**
   * A venue earns the bowl plan by having bands that know where they are.
   * Two is the floor: one arc is not a ring, and drawing it would say the
   * ground has one side.
   */
  const hasBowl = map.tiers.filter((t) => typeof t.bearing === 'number').length >= 2;

  const chosenStandLabel = chosenTier
    ? (map.tiers.find((t) => t.tier === chosenTier)?.label ?? null)
    : null;

  // Plain derivation, not a hook, so it is fine below the guard: which stand
  // the seat list is currently in, so the plan and the list can both light it.
  const visibleTier = visibleRow
    ? selection.rows.find((r) => r.label === visibleRow)?.seats[0]?.tier
    : undefined;
  const salesClosed = new Date(map.salesCloseAt).getTime() <= new Date(map.serverTime).getTime();
  const count = selection.selectedSeats.length;
  /** How many the auto-pick looks for: what they said, else a pair. */
  const wanted = Math.min(partySize ?? 2, map.maxSeatsPerBooking);

  const lost = selection.lostSeats;
  const message = salesClosed
    ? 'Booking has closed for this screening.'
    : holdError
      ? holdError
      : // Below a failed hold, which the person just caused and is waiting on,
        // and above a refused tap, which they can see for themselves.
        lost.length > 0
        ? `${lost.length === 1 ? 'Seat' : 'Seats'} ${joinWords(lost)} ${
            lost.length === 1 ? 'was' : 'were'
          } taken while you were choosing.`
        : selection.rejection === 'LIMIT'
          ? `You can book up to ${selection.maxSeats} seats at once.`
          : selection.rejection === 'UNAVAILABLE'
            ? 'That seat is no longer available.'
            : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppBar
        title={subjectTitle(map)}
        // A multiplex has a name and an auditorium inside it; a ground is its
        // own single room, and the seed gives both the venue's name, so the
        // bar read "Eden Gardens · Eden Gardens". Say it once when they agree.
        subtitle={
          map.screen.name === map.cinema.name
            ? map.cinema.name
            : `${map.cinema.name} · ${map.screen.name}`
        }
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
            label inside it would sit off-screen until the user panned.

            A bowl whose bands carry bearings gets the plan instead of the
            facing arrow — it answers "which side am I on", which the arrow
            never could, and it already contains the ground drawing. */}
        {hasBowl ? (
          <StadiumBowl
            tiers={map.tiers}
            activeTier={chosenTier ?? visibleTier}
            onSelectStand={jumpToStand}
          />
        ) : (
          <VenueFacing facing={map.event?.kind ?? 'FILM'} />
        )}
        {/* Above the band list, because "can I sit here at all" comes before
            "which band". Renders nothing in a room with no spaces. */}
        <AccessibleSeats
          rows={selection.rows}
          seats={map.seats}
          statusOf={selection.statusOf}
          onJump={(rowY) => gridRef.current?.scrollToRow(rowY)}
        />
        {stands.length > 0 ? (
          <View style={{ paddingBottom: spacing.lg }}>
            <StandPicker
              stands={stands}
              currency={map.currency}
              activeTier={chosenTier ?? visibleTier}
              onSelect={jumpToStand}
            />
          </View>
        ) : null}
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
                label={
                  chosenStandLabel
                    ? `Best ${wanted} in ${chosenStandLabel}`
                    : `Best ${wanted} seat${wanted === 1 ? '' : 's'} for me`
                }
                variant="secondary"
                onPress={() => {
                  // Inside the chosen stand when there is one. Searching the
                  // whole bowl would answer "the cheap end, please" with the
                  // most expensive seats in the ground.
                  const searchRows = chosenTier
                    ? selection.rows.filter((r) => r.seats.some((x) => x.tier === chosenTier))
                    : selection.rows;
                  const best = findBestSeats(
                    searchRows,
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
                      chosenStandLabel
                        ? `No ${wanted} seats together are free in ${chosenStandLabel}. Try another stand, or pick them one by one.`
                        : `No ${wanted} seats together are free. Pick them one by one, or try another showing.`,
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
