import type { Booking, BookingList } from '@app/shared';

/**
 * How many months in a row somebody has booked something.
 *
 * Derived, not stored. The booking list is already fetched for the Bookings
 * tab and the profile, every date needed is on it, and a streak the server
 * kept would be a second copy of the same fact that could disagree with the
 * first.
 *
 * Months, not weeks or days. A weekly cinema habit is rare enough that a
 * weekly streak would read 1 for almost everybody and 0 the rest of the time,
 * which is a counter that only ever delivers bad news. A month is roughly how
 * often people actually go, so the number moves, and a run of six means
 * something.
 *
 * Counted on `confirmedAt`, the moment the booking became real, rather than
 * on when the film plays. Someone who books tonight's show this afternoon has
 * kept this month's streak this afternoon - not in four hours when the lights
 * go down, and not next month if they booked a preview. The alternative reads
 * as the app not noticing what you just did.
 */

export type Streak = {
  /** Consecutive months with a booking, up to and including this one. */
  current: number;
  /** The longest such run in the whole history. */
  longest: number;
  /**
   * The current run is still standing but this month is empty, so one more
   * month of nothing ends it.
   *
   * A streak is not broken the instant a month turns over - that would wipe
   * a nine-month run at midnight on the first and tell somebody they had
   * nothing. It is broken once a whole month has passed with no booking.
   */
  atRisk: boolean;
  /** Months with at least one booking, most recent first. `YYYY-MM`. */
  months: string[];
};

/** A local-time month key. Local, because a streak is about somebody's life. */
function monthKey(date: Date): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`;
}

/** The key for `offset` months before `from`. */
function monthKeyBefore(from: Date, offset: number): string {
  return monthKey(new Date(from.getFullYear(), from.getMonth() - offset, 1));
}

function confirmedMonths(bookings: Booking[]): Set<string> {
  const months = new Set<string>();
  for (const booking of bookings) {
    // A cancelled or failed booking is not a visit, and `confirmedAt` is null
    // until a payment lands, so both filters are doing real work.
    if (booking.status !== 'CONFIRMED' || !booking.confirmedAt) continue;
    const when = new Date(booking.confirmedAt);
    if (Number.isNaN(when.getTime())) continue;
    months.add(monthKey(when));
  }
  return months;
}

export function bookingStreak(list: BookingList | undefined, now: Date = new Date()): Streak {
  const empty: Streak = { current: 0, longest: 0, atRisk: false, months: [] };
  if (!list) return empty;

  // Both lists: a booking for next week was still made this month, and it is
  // the one most likely to be keeping the run alive.
  const months = confirmedMonths([...list.upcoming, ...list.past]);
  if (months.size === 0) return empty;

  const thisMonth = monthKey(now);
  const bookedThisMonth = months.has(thisMonth);
  // Count from last month when this one is still empty, so the run survives
  // the turn of the month rather than being reported as lost on the 1st.
  const countFrom = bookedThisMonth ? 0 : 1;

  let current = 0;
  for (let offset = countFrom; ; offset += 1) {
    if (!months.has(monthKeyBefore(now, offset))) break;
    current += 1;
  }

  const sorted = [...months].sort();
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const month of sorted) {
    const [year, mon] = month.split('-').map(Number);
    const expected = previous === null ? null : monthKey(new Date(year, mon - 2, 1));
    run = previous !== null && previous === expected ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = month;
  }

  return {
    current,
    longest: Math.max(longest, current),
    atRisk: current > 0 && !bookedThisMonth,
    months: sorted.reverse(),
  };
}
