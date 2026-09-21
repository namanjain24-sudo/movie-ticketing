import type { SeatMapSeat } from '@app/shared';
import type { SeatRenderStatus, SeatRow } from './use-seat-selection';

/** Where in the room the best view is: a little behind the middle, not the front row. */
const IDEAL_DEPTH = 0.62;
/** What leaving a lone empty seat beside the group costs, in the same units as distance. */
const ORPHAN_PENALTY = 0.35;

const OPEN: SeatRenderStatus[] = ['AVAILABLE', 'HELD_BY_YOU'];

/**
 * Picks `count` seats together, the way a person scanning the map would: one row,
 * side by side, near the middle of the room and a little behind the centre line.
 *
 * "Together" means adjacent grid columns. A gap in `x` is an aisle, and a group
 * split by an aisle is two groups. Wheelchair spaces are never handed out by
 * this — they exist for the people who need them, and an auto-pick that takes
 * them is the sort of default nobody notices until it matters.
 *
 * A window that would strand exactly one empty seat beside it is marked down.
 * That seat is close to unsellable, so leaving it is a small cost to the cinema
 * and to the next person; the penalty only decides between otherwise similar
 * windows, it never rules one out.
 *
 * Returns `null` when no row has `count` open seats in a line.
 */
export function findBestSeats(
  rows: SeatRow[],
  statusOf: (seat: SeatMapSeat) => SeatRenderStatus,
  count: number,
  columnCount: number,
): SeatMapSeat[] | null {
  if (count < 1) return null;

  const lastRow = Math.max(rows.length - 1, 1);
  const centreX = (columnCount - 1) / 2;
  let best: { seats: SeatMapSeat[]; score: number } | null = null;

  rows.forEach((row, rowIndex) => {
    const depth = Math.abs(rowIndex / lastRow - IDEAL_DEPTH);

    // Split the row into unbroken runs of open seats.
    const runs: SeatMapSeat[][] = [];
    let run: SeatMapSeat[] = [];
    for (const seat of row.seats) {
      const open = !seat.accessible && OPEN.includes(statusOf(seat));
      const previous = run[run.length - 1];
      if (open && previous && seat.x === previous.x + 1) {
        run.push(seat);
      } else {
        if (run.length > 0) runs.push(run);
        run = open ? [seat] : [];
      }
    }
    if (run.length > 0) runs.push(run);

    for (const candidate of runs) {
      for (let start = 0; start + count <= candidate.length; start++) {
        const seats = candidate.slice(start, start + count);
        const left = start;
        const right = candidate.length - start - count;
        const orphans = (left === 1 ? 1 : 0) + (right === 1 ? 1 : 0);
        const middle = (seats[0].x + seats[seats.length - 1].x) / 2;
        const score =
          depth +
          (Math.abs(middle - centreX) / Math.max(columnCount, 1)) * 2 +
          orphans * ORPHAN_PENALTY;

        if (best === null || score < best.score) best = { seats, score };
      }
    }
  });

  return best === null ? null : (best as { seats: SeatMapSeat[] }).seats;
}
