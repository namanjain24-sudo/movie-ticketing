import type { ShowtimeSummary } from '@app/shared';

/**
 * How a film's cinemas are ordered, and what the cheapest seat in the list is.
 *
 * The page sorted by distance and nothing else, which answers one of the two
 * questions people actually have. In this market the same film at the same
 * time is routinely 150 rupees at one multiplex and 400 at another, and every
 * showtime in the response already carries `fromPriceMinor`. The app had the
 * number and no way to use it.
 *
 * Showtimes *within* a cinema are never reordered. They are a timetable, and
 * a timetable sorted by price is not one.
 */

type Entry<T> = {
  cinema: { distanceKm: number | null };
  showtimes: T[];
};

export const SHOWTIME_ORDERS = [
  { id: 'nearest', label: 'Nearest' },
  { id: 'cheapest', label: 'Cheapest' },
  { id: 'earliest', label: 'Earliest' },
] as const;

export type ShowtimeOrder = (typeof SHOWTIME_ORDERS)[number]['id'];

/** The lowest `fromPriceMinor` at one cinema, or null when it has no shows. */
export function cheapestAt<T extends ShowtimeSummary>(entry: Entry<T>): number | null {
  let lowest: number | null = null;
  for (const slot of entry.showtimes) {
    if (lowest === null || slot.fromPriceMinor < lowest) lowest = slot.fromPriceMinor;
  }
  return lowest;
}

/**
 * The lowest price anywhere in the list, so one row can be marked as the
 * cheapest going. Null when there is nothing to compare.
 */
export function cheapestInList<T extends ShowtimeSummary>(cinemas: Entry<T>[]): number | null {
  let lowest: number | null = null;
  for (const entry of cinemas) {
    const here = cheapestAt(entry);
    if (here !== null && (lowest === null || here < lowest)) lowest = here;
  }
  return lowest;
}

/**
 * Whether marking the cheapest venue actually narrows anything.
 *
 * Seen on a device: three cinemas all opening at 220 rupees, and all three
 * wearing a "Cheapest" badge. Every one of them was telling the truth and the
 * badge was worth nothing - a label on every row is a label on none.
 *
 * So it is only worth drawing when at least one venue is dearer than the
 * cheapest. One cinema in the list is the same case: it cannot be cheaper
 * than itself.
 */
export function cheapestIsWorthMarking<T extends ShowtimeSummary>(cinemas: Entry<T>[]): boolean {
  const lowest = cheapestInList(cinemas);
  if (lowest === null) return false;
  return cinemas.some((entry) => {
    const here = cheapestAt(entry);
    return here !== null && here > lowest;
  });
}

/** The first showtime at one cinema, as a timestamp. Infinity when it has none. */
function earliestAt<T extends ShowtimeSummary>(entry: Entry<T>): number {
  let soonest = Number.POSITIVE_INFINITY;
  for (const slot of entry.showtimes) {
    const at = new Date(slot.startsAt).getTime();
    if (!Number.isNaN(at) && at < soonest) soonest = at;
  }
  return soonest;
}

export function orderCinemas<T extends ShowtimeSummary, G extends Entry<T>>(
  cinemas: G[],
  order: ShowtimeOrder,
): G[] {
  /**
   * `nearest` is the server's own order, left exactly as it arrived.
   *
   * The API sorts by distance when it was sent a position and alphabetically
   * when it was not, and re-sorting here would either repeat work or, worse,
   * disagree with it: a client comparing rounded kilometres can order two
   * cinemas differently from the server that rounded them.
   */
  if (order === 'nearest') return cinemas;

  const copy = [...cinemas];

  if (order === 'earliest') {
    return copy.sort((a, b) => earliestAt(a) - earliestAt(b));
  }

  return copy.sort((a, b) => {
    const pa = cheapestAt(a);
    const pb = cheapestAt(b);
    // A cinema with no price left after filtering sorts last rather than as
    // free, which is what treating null as 0 would do.
    if (pa === null) return pb === null ? 0 : 1;
    if (pb === null) return -1;
    if (pa !== pb) return pa - pb;
    // Same price: the nearer one first, which is the order it arrived in.
    return 0;
  });
}
