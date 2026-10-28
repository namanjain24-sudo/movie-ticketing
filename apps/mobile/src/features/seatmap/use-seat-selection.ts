import type { SeatMap, SeatMapSeat } from '@app/shared';
import { useCallback, useMemo, useState } from 'react';

/** What the renderer draws, which is not quite what the server sent. */
export type SeatRenderStatus = SeatMapSeat['status'] | 'SELECTED';

export type SeatRow = {
  /** Grid row index, used as the list key. */
  y: number;
  label: string;
  seats: SeatMapSeat[];
};

export type SelectionRejection = 'LIMIT' | 'UNAVAILABLE';

const SELECTABLE: SeatMapSeat['status'][] = ['AVAILABLE', 'HELD_BY_YOU'];

/**
 * Turns the flat seat array into rows once, then keeps the tap rules in one
 * place. Rows are built from the grid coordinates rather than the row label,
 * because labels repeat across blocks in the larger auditoriums.
 */
export function useSeatSelection(map: SeatMap | undefined, partySize?: number) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejection, setRejection] = useState<SelectionRejection | null>(null);
  /** Seats the server told us were gone after the map was drawn. */
  const [taken, setTaken] = useState<Set<string>>(new Set());

  const rows = useMemo<SeatRow[]>(() => {
    if (!map) return [];
    const byRow = new Map<number, SeatRow>();
    for (const seat of map.seats) {
      const row = byRow.get(seat.y) ?? { y: seat.y, label: seat.rowLabel, seats: [] };
      row.seats.push(seat);
      byRow.set(seat.y, row);
    }
    for (const row of byRow.values()) row.seats.sort((a, b) => a.x - b.x);
    return [...byRow.values()].sort((a, b) => a.y - b.y);
  }, [map]);

  const seatsById = useMemo(() => {
    const index = new Map<string, SeatMapSeat>();
    for (const seat of map?.seats ?? []) index.set(seat.id, seat);
    return index;
  }, [map]);

  /**
   * The seat map never lies: `selected` only records which ids the user has
   * tapped, it is not proof those seats are still selectable. Every place
   * below that turns `selected` into something rendered or totalled re-checks
   * the seat's live status (from `map`, via `seat.status` where a fresh seat
   * object is already in hand, or via `seatsById` otherwise) rather than
   * trusting the tap history alone. That is what lets a seat the user picked
   * grey out in place the moment a refetch reports someone else took it
   * (`refetchOnWindowFocus`, see PRODUCT.md), with no extra state to keep in
   * sync and no risk of a stale id lingering past a seat's true status.
   * `taken`, below, is the complementary case: a seat a hold attempt just
   * told us is gone, before the map itself has caught up.
   */
  const statusOf = useCallback(
    (seat: SeatMapSeat): SeatRenderStatus => {
      if (selected.has(seat.id) && SELECTABLE.includes(seat.status)) return 'SELECTED';
      if (taken.has(seat.id)) return 'UNAVAILABLE';
      return seat.status;
    },
    [selected, taken],
  );

  /**
   * The party size the user named narrows the cap, but never widens it past
   * what the server will accept — that limit is not ours to raise.
   */
  const serverMax = map?.maxSeatsPerBooking ?? 0;
  const maxSeats = partySize ? Math.min(partySize, serverMax) : serverMax;

  /**
   * The authoritative selection: tapped ids, filtered down to the ones whose
   * seat is still selectable right now. A seat that went stale (sold to
   * someone else since the last map refetch) drops out on its own, with
   * nothing elsewhere needing to notice the map changed.
   */
  const selectedSeats = useMemo(
    () =>
      [...selected]
        .map((id) => seatsById.get(id))
        .filter(
          (seat): seat is SeatMapSeat => seat !== undefined && SELECTABLE.includes(seat.status),
        )
        .sort((a, b) => a.y - b.y || a.x - b.x),
    [selected, seatsById],
  );

  /**
   * The seats that went while the map sat on screen.
   *
   * Pure derivation, and it can be: an id is only ever added to `selected` by
   * a tap, and `toggle` refuses to add a seat that is not selectable. So a
   * tapped id whose seat is no longer selectable means exactly one thing —
   * somebody else took it after it was chosen. Nothing has to remember a
   * previous render to know that.
   *
   * `selectedSeats` already drops those seats, which is the design above and
   * is right. What it did not do is say anything. The row emptied, the
   * subtotal fell, the button counted one fewer, and nothing on screen
   * connected those three to a cause. The person is left to notice ₹900
   * became ₹600 on a screen they were not touching, and the kindest reading
   * available to them is that the app miscounted.
   *
   * The rejected-hold path does not appear here: `markUnavailable` takes its
   * ids out of `selected`, so that screen's own conflict message is never
   * doubled up by this one.
   *
   * A seat that comes back — holds expire after five minutes — leaves this
   * list on the same refetch that returns it to `selectedSeats`. The notice
   * and the seat are two readings of one fact, so they cannot disagree.
   */
  const lostSeats = useMemo(
    () =>
      [...selected]
        .map((id) => seatsById.get(id))
        .filter(
          (seat): seat is SeatMapSeat => seat !== undefined && !SELECTABLE.includes(seat.status),
        )
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((seat) => `${seat.rowLabel}${seat.number}`),
    [selected, seatsById],
  );

  /** Returns whether the tap was taken, so the caller can match the feedback. */
  const toggle = useCallback(
    (seat: SeatMapSeat): boolean => {
      setRejection(null);

      if (taken.has(seat.id) || !SELECTABLE.includes(seat.status)) {
        setRejection('UNAVAILABLE');
        return false;
      }

      // Decided here rather than inside the updater, which React may run more
      // than once and which must stay free of side effects. The seat is
      // already known selectable at this point (the guard above returned
      // otherwise), so only membership in `selected` is in question.
      const alreadySelected = selected.has(seat.id);
      if (!alreadySelected && selectedSeats.length >= maxSeats) {
        setRejection('LIMIT');
        return false;
      }

      setSelected((current) => {
        const next = new Set(current);
        if (next.has(seat.id)) next.delete(seat.id);
        else next.add(seat.id);
        // Making a fresh choice answers the notice: ids whose seats have gone
        // come out here, so a message about row F does not follow somebody
        // down the screen after they have settled on row K. Done in the
        // handler, where a state change belongs, rather than in an effect
        // reacting to the map.
        for (const id of [...next]) {
          const existing = seatsById.get(id);
          if (existing && !SELECTABLE.includes(existing.status)) next.delete(id);
        }
        return next;
      });
      return true;
    },
    // selectedSeats.length, not selectedSeats itself: the array gets a new
    // identity on every map refetch (even one that changes nothing the user
    // selected), and that must not recreate `toggle` on every seat's onPress.
    [maxSeats, taken, selected, selectedSeats.length, seatsById],
  );

  /**
   * Applies a seat conflict from a rejected hold. The seats grey out where
   * they are and drop out of the selection, so the user corrects a map they
   * are already looking at instead of being sent back a screen.
   */
  const markUnavailable = useCallback((showSeatIds: string[]) => {
    setTaken((current) => new Set([...current, ...showSeatIds]));
    setSelected((current) => {
      const next = new Set(current);
      for (const id of showSeatIds) next.delete(id);
      return next;
    });
    setRejection('UNAVAILABLE');
  }, []);

  /**
   * Replaces the whole selection, for an auto-pick. Seats that are not
   * selectable are dropped and the party-size cap still applies, so a caller
   * cannot use this to get past a rule the taps enforce.
   */
  const selectSeats = useCallback(
    (seats: SeatMapSeat[]) => {
      const usable = seats
        .filter((seat) => !taken.has(seat.id) && SELECTABLE.includes(seat.status))
        .slice(0, maxSeats);
      setSelected(new Set(usable.map((seat) => seat.id)));
      setRejection(null);
    },
    [maxSeats, taken],
  );

  const clear = useCallback(() => {
    setSelected(new Set());
    setRejection(null);
  }, []);

  const subtotalMinor = selectedSeats.reduce((sum, seat) => sum + seat.priceMinor, 0);

  return {
    rows,
    statusOf,
    toggle,
    selectSeats,
    clear,
    markUnavailable,
    selectedSeats,
    selectedIds: selectedSeats.map((seat) => seat.id),
    subtotalMinor,
    maxSeats,
    atLimit: selectedSeats.length >= maxSeats,
    rejection,
    dismissRejection: useCallback(() => setRejection(null), []),
    /** Labels of seats taken out from under the selection, in seating order. */
    lostSeats,
  };
}
