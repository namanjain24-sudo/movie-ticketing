import type { SeatDelta } from '@app/shared';
import { publishBestEffort } from '../../redis';

/** One channel per showtime, so a subscriber only receives its own room. */
export function seatChannel(showtimeId: string): string {
  return `showtime:${showtimeId}:seats`;
}

/**
 * Announce seat state changes to everyone watching this showtime.
 *
 * Deliberately best-effort and always called *after* the transaction commits.
 * Publishing inside the transaction would broadcast changes that a rollback
 * then erases, and a Redis outage would take the booking path down with it.
 * A dropped broadcast costs a client one stale seat until its next read; a
 * broadcast of an uncommitted change costs correctness.
 */
export async function publishSeatDeltas(showtimeId: string, seats: SeatDelta[]): Promise<void> {
  if (seats.length === 0) return;
  await publishBestEffort(seatChannel(showtimeId), {
    type: 'seat.update',
    showtimeId,
    seats,
    at: new Date().toISOString(),
  });
}
