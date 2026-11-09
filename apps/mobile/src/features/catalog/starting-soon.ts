import type { AvailabilityBand, CinemaShowtimes, ShowtimeSummary } from '@app/shared';

/**
 * What you can still get to tonight.
 *
 * The home screen already answers "what is on". It did not answer the
 * question somebody standing up off a sofa at twenty past eight actually has,
 * which is narrower: of the things on, which ones have not started, are still
 * selling, have seats, and are close enough that leaving now is enough.
 *
 * All four of those are in data the app already holds. `/showtimes` returns a
 * whole day grouped by cinema, with `distanceKm` on each cinema when the
 * caller sent a position, so this is a selector over a response that is
 * already on screen rather than another request.
 *
 * It is deliberately not called "deals". There is no per-showtime discount
 * anywhere in the catalogue, and a badge claiming one would be inventing a
 * number the server never said. What is real here is the price, the distance,
 * the seats left and the clock.
 */

export type SoonShow = {
  /** A showtime id is unique across cinemas, so it keys the flat list. */
  id: string;
  showtime: ShowtimeSummary;
  cinema: CinemaShowtimes['cinema'];
  /** Whole minutes from `now` until it starts. Never negative. */
  minutesUntil: number;
};

/** How long you are assumed to need, per kilometre, to get across a city. */
const MINUTES_PER_KM = 3;

/** Parking, the queue, finding the screen. */
const ARRIVAL_BUFFER_MINUTES = 10;

/** How far ahead counts as "soon". Three hours is one evening's worth. */
export const SOON_WINDOW_MINUTES = 180;

const UNSELLABLE: AvailabilityBand = 'SOLD_OUT';

/**
 * The earliest you would have to leave, in minutes before the show.
 *
 * A show twenty minutes away and fifteen kilometres out is not a thing you
 * can go to, and offering it is worse than offering nothing: it reads as the
 * app not knowing where you are. `MINUTES_PER_KM` is a crude single number
 * for city traffic rather than a routing engine, which is why nothing in the
 * UI quotes it at anybody. It decides what to show, and says nothing.
 *
 * Null distance means the caller sent no position, so there is no travel
 * claim to make and the filter stands down entirely.
 */
function travelAllowanceMinutes(distanceKm: number | null): number {
  if (distanceKm === null) return 0;
  return Math.round(distanceKm * MINUTES_PER_KM) + ARRIVAL_BUFFER_MINUTES;
}

function eligible(
  slot: ShowtimeSummary,
  distanceKm: number | null,
  now: number,
  withinMinutes: number,
): boolean {
  const startsAt = new Date(slot.startsAt).getTime();
  const closesAt = new Date(slot.salesCloseAt).getTime();
  if (Number.isNaN(startsAt) || Number.isNaN(closesAt)) return false;

  // Already begun, or no longer selling.
  if (startsAt <= now || closesAt <= now) return false;
  if (slot.availability === UNSELLABLE) return false;

  const minutesUntil = (startsAt - now) / 60_000;
  if (minutesUntil > withinMinutes) return false;
  return minutesUntil >= travelAllowanceMinutes(distanceKm);
}

/**
 * Ranked by how soon it starts, nearest first where two are equally soon.
 *
 * Soonest rather than nearest, because the window has already thrown out
 * everything unreachable: once every row is somewhere you could be in time,
 * the one that is about to go is the one worth saying first.
 */
export function startingSoon(
  cinemas: CinemaShowtimes[],
  now: number,
  withinMinutes: number = SOON_WINDOW_MINUTES,
): SoonShow[] {
  const rows: SoonShow[] = [];

  for (const entry of cinemas) {
    for (const slot of entry.showtimes) {
      if (!eligible(slot, entry.cinema.distanceKm, now, withinMinutes)) continue;
      const startsAt = new Date(slot.startsAt).getTime();
      rows.push({
        id: slot.id,
        showtime: slot,
        cinema: entry.cinema,
        minutesUntil: Math.max(0, Math.round((startsAt - now) / 60_000)),
      });
    }
  }

  return rows.sort((a, b) => {
    const byTime =
      new Date(a.showtime.startsAt).getTime() - new Date(b.showtime.startsAt).getTime();
    if (byTime !== 0) return byTime;
    // Null distance sorts last rather than as zero: without a position every
    // row is null and the comparison never runs, and with one a cinema that
    // somehow lacks a distance should not be promoted above one that has it.
    const da = a.cinema.distanceKm ?? Number.POSITIVE_INFINITY;
    const db = b.cinema.distanceKm ?? Number.POSITIVE_INFINITY;
    return da - db;
  });
}

/**
 * The next moment at which this list stops being the right answer.
 *
 * Same bargain as `nextCloseAfter` in `./closing`, and for the same reason:
 * the response is correct and only the clock has moved, so refetching a
 * 222KB day to re-derive it would be paying for nothing. A row leaves or
 * joins the list at one of four instants, and this returns the first of them
 * that is still ahead.
 *
 * Null means nothing further can change, which is the useful half: a screen
 * given null should not hold a timer open for the rest of the session.
 */
export function nextStartingSoonChangeAfter(
  cinemas: CinemaShowtimes[],
  now: number,
  withinMinutes: number = SOON_WINDOW_MINUTES,
): number | null {
  let soonest: number | null = null;
  const consider = (at: number) => {
    if (at > now && (soonest === null || at < soonest)) soonest = at;
  };

  for (const entry of cinemas) {
    const allowance = travelAllowanceMinutes(entry.cinema.distanceKm) * 60_000;
    for (const slot of entry.showtimes) {
      const startsAt = new Date(slot.startsAt).getTime();
      const closesAt = new Date(slot.salesCloseAt).getTime();
      if (Number.isNaN(startsAt) || Number.isNaN(closesAt)) continue;

      // Enters the window.
      consider(startsAt - withinMinutes * 60_000);
      // Becomes too late to reach.
      consider(startsAt - allowance);
      // Stops selling, and starts.
      consider(closesAt);
      consider(startsAt);
    }
  }

  return soonest;
}
