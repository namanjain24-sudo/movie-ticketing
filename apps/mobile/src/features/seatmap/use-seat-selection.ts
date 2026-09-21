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

  const statusOf = useCallback(
    (seat: SeatMapSeat): SeatRenderStatus => {
      if (selected.has(seat.id)) return 'SELECTED';
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

  /** Returns whether the tap was taken, so the caller can match the feedback. */
  const toggle = useCallback(
    (seat: SeatMapSeat): boolean => {
      setRejection(null);

      if (taken.has(seat.id) || !SELECTABLE.includes(seat.status)) {
        setRejection('UNAVAILABLE');
        return false;
      }

      // Decided here rather than inside the updater, which React may run more
      // than once and which must stay free of side effects.
      const alreadySelected = selected.has(seat.id);
      if (!alreadySelected && selected.size >= maxSeats) {
        setRejection('LIMIT');
        return false;
      }

      setSelected((current) => {
        const next = new Set(current);
        if (next.has(seat.id)) next.delete(seat.id);
        else next.add(seat.id);
        return next;
      });
      return true;
    },
    [maxSeats, taken, selected],
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

  const selectedSeats = useMemo(
    () =>
      [...selected]
        .map((id) => seatsById.get(id))
        .filter((seat): seat is SeatMapSeat => seat !== undefined)
        .sort((a, b) => a.y - b.y || a.x - b.x),
    [selected, seatsById],
  );

  const subtotalMinor = selectedSeats.reduce((sum, seat) => sum + seat.priceMinor, 0);

  return {
    rows,
    statusOf,
    toggle,
    selectSeats,
    clear,
    markUnavailable,
    selectedSeats,
    selectedIds: [...selected],
    subtotalMinor,
    maxSeats,
    atLimit: selected.size >= maxSeats,
    rejection,
    dismissRejection: useCallback(() => setRejection(null), []),
  };
}
