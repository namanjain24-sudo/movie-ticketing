import type { CinemaShowtimes, ShowtimeSummary } from '@app/shared';

/**
 * Which screenings have stopped selling, and when the next one will.
 *
 * The API hands back a whole day at a time, so a list fetched at six in the
 * evening still contains the matinees. Marking them is not the hard part —
 * both screens already did that. The hard part is that the answer has an
 * expiry: it is computed against a clock read once, and then the screen sits
 * there. Twenty minutes on a film page is an ordinary thing to do, and for
 * nineteen of them a six o'clock show went on looking bookable, in the colour
 * that means bookable, with a price under it. Tapping it was the first anyone
 * heard otherwise, a screen later, from the seat map.
 *
 * Refetching would fix it and cost far too much: a film's list across a city
 * is 222KB. Nothing in it has gone out of date except the clock, and the
 * clock is free. `nextCloseAfter` says when the next chip's answer changes,
 * so the screen can wake exactly then and at no other time.
 */

export type ClosableShowtime = ShowtimeSummary & { closed: boolean };
export type MarkedCinema = Omit<CinemaShowtimes, 'showtimes'> & {
  showtimes: ClosableShowtime[];
};

export function markClosed(cinemas: CinemaShowtimes[], now: number): MarkedCinema[] {
  return cinemas.map((entry) => ({
    ...entry,
    showtimes: entry.showtimes.map((slot) => ({
      ...slot,
      closed: new Date(slot.salesCloseAt).getTime() <= now,
    })),
  }));
}

/**
 * The first moment after `now` at which some chip in this list stops being
 * bookable, or null when every one of them already has.
 *
 * Null is the useful half: an old date, or an evening late enough that the
 * day is done, leaves nothing that can change, and a screen showing it should
 * not hold a timer open for the rest of the session to find that out again.
 */
export function nextCloseAfter(cinemas: CinemaShowtimes[], now: number): number | null {
  let soonest: number | null = null;
  for (const entry of cinemas) {
    for (const slot of entry.showtimes) {
      const at = new Date(slot.salesCloseAt).getTime();
      if (at > now && (soonest === null || at < soonest)) soonest = at;
    }
  }
  return soonest;
}
