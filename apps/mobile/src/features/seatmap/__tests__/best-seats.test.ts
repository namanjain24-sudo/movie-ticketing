import type { SeatMapSeat } from '@app/shared';
import { findBestSeats } from '../best-seats';
import type { SeatRenderStatus, SeatRow } from '../use-seat-selection';

/** Builds rows from strings: `.` open, `x` sold, `w` wheelchair, ` ` aisle. */
function room(...layout: string[]): SeatRow[] {
  return layout.map((line, y) => ({
    y,
    label: String.fromCharCode(65 + y),
    seats: [...line].flatMap((ch, x): SeatMapSeat[] =>
      ch === ' '
        ? []
        : [
            {
              id: `${y}-${x}`,
              rowLabel: String.fromCharCode(65 + y),
              number: x + 1,
              x,
              y,
              tier: 'STANDARD',
              priceMinor: 20000,
              accessible: ch === 'w',
              status: ch === 'x' ? 'SOLD' : 'AVAILABLE',
            },
          ],
    ),
  }));
}

const status = (seat: SeatMapSeat): SeatRenderStatus => seat.status;
const ids = (seats: SeatMapSeat[] | null) => seats?.map((s) => s.id);

describe('findBestSeats', () => {
  it('picks the middle of the room, side by side', () => {
    const rows = room('.........', '.........', '.........');
    const seats = findBestSeats(rows, status, 3, 9);
    expect(seats?.map((s) => s.x)).toEqual([3, 4, 5]);
  });

  it('prefers a row behind the front over the front row', () => {
    const rows = room('.....', '.....', '.....', '.....', '.....');
    const seats = findBestSeats(rows, status, 2, 5);
    // Ideal depth is 62% of the way back, so the front row must never win.
    expect(seats?.[0].y).toBeGreaterThanOrEqual(2);
    expect(seats?.[0].y).toBeLessThanOrEqual(3);
  });

  it('never splits a group across an aisle', () => {
    // Two seats either side of the aisle, and nothing anywhere else.
    const rows = room('xx.. ..xx');
    expect(findBestSeats(rows, status, 4, 9)).toBeNull();
    expect(findBestSeats(rows, status, 2, 9)).not.toBeNull();
  });

  it('never splits a group around a sold seat', () => {
    const rows = room('..x..');
    expect(findBestSeats(rows, status, 3, 5)).toBeNull();
    expect(ids(findBestSeats(rows, status, 2, 5))).toBeDefined();
  });

  it('will not hand out wheelchair spaces', () => {
    const rows = room('www');
    expect(findBestSeats(rows, status, 1, 3)).toBeNull();
  });

  it('returns null when no row is long enough, or the count is nonsense', () => {
    const rows = room('..', '..');
    expect(findBestSeats(rows, status, 3, 2)).toBeNull();
    expect(findBestSeats(rows, status, 0, 2)).toBeNull();
    expect(findBestSeats([], status, 1, 0)).toBeNull();
  });

  it('avoids stranding a single seat beside the group', () => {
    // Centred, three of five would leave one seat on each side, and nobody buys
    // a lone seat. The window has to shift so that no leftover is exactly one.
    const rows = room('.....');
    const seats = findBestSeats(rows, status, 3, 5) ?? [];
    const left = seats[0].x;
    const right = 4 - seats[seats.length - 1].x;
    expect(left).not.toBe(1);
    expect(right).not.toBe(1);
  });

  it('honours what the caller says a seat is, not what the server sent', () => {
    const rows = room('....');
    const gone = new Set(['0-1']);
    const seats = findBestSeats(rows, (s) => (gone.has(s.id) ? 'UNAVAILABLE' : s.status), 2, 4);
    expect(seats?.map((s) => s.x)).toEqual([2, 3]);
  });

  it('treats seats already held by the caller as open', () => {
    const rows = room('..');
    const seats = findBestSeats(rows, () => 'HELD_BY_YOU', 2, 2);
    expect(seats).toHaveLength(2);
  });
});
