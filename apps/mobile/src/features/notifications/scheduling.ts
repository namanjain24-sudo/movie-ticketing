import { travelAllowanceMinutes } from '@app/shared';

/** How far before a showtime the reminder fires. */
export const SHOWTIME_REMINDER_LEAD_MS = 2 * 60 * 60 * 1000;

/** How far before a hold expires the "come back and pay" nudge fires. */
export const HOLD_NUDGE_LEAD_MS = 60 * 1000;

/**
 * When to fire the showtime reminder, or `null` when there is nothing useful
 * left to say: the film has already started, or is starting sooner than the
 * lead time (a reminder that fires in the past is not a reminder).
 */
export function showtimeReminderTime(startsAtIso: string, now: Date = new Date()): Date | null {
  const fireAt = new Date(startsAtIso).getTime() - SHOWTIME_REMINDER_LEAD_MS;
  return fireAt > now.getTime() ? new Date(fireAt) : null;
}

/**
 * When somebody would have to leave to make a showing, or null when there is
 * nothing honest to say.
 *
 * The existing reminder fires a flat two hours before every showing, which is
 * wrong for everybody: far too much notice for a cinema down the road, and
 * not enough for one across a city in evening traffic. This is the same fact
 * measured against where the cinema actually is.
 *
 * Null when there is no distance, which is the common case: the position is
 * only ever read, never asked for, so somebody who has not granted it keeps
 * the flat reminder and is told nothing about travel. Inventing a journey
 * would be worse than saying nothing.
 *
 * The travel allowance itself is `@app/shared`'s, the same one the home
 * screen uses to decide which showings are still catchable, so the app cannot
 * think a show is reachable on one screen and unreachable on another.
 */
export function leaveByAt(startsAtIso: string, distance: number | null): Date | null {
  if (distance === null) return null;
  const startsAt = new Date(startsAtIso).getTime();
  if (Number.isNaN(startsAt)) return null;
  return new Date(startsAt - travelAllowanceMinutes(distance) * 60_000);
}

/**
 * The same instant, but only when it is still ahead - a reminder to leave
 * that fires once you should already have arrived is not a reminder, which is
 * the rule `showtimeReminderTime` above already follows.
 */
export function leaveReminderTime(
  startsAtIso: string,
  distance: number | null,
  now: Date = new Date(),
): Date | null {
  const leaveAt = leaveByAt(startsAtIso, distance);
  if (!leaveAt) return null;
  return leaveAt.getTime() > now.getTime() ? leaveAt : null;
}

/**
 * When to fire the hold-expiry nudge, or `null` when there is not enough time
 * left for it to be worth scheduling.
 *
 * Anchored to `serverTime` exactly the way the checkout countdown is
 * (`useCountdown`), never the device clock: a phone whose clock is wrong
 * would otherwise fire the nudge early or too late relative to when the
 * server actually releases the seats.
 */
export function holdNudgeTime(
  expiresAtIso: string,
  serverTimeIso: string,
  now: Date = new Date(),
): Date | null {
  const offsetMs = new Date(serverTimeIso).getTime() - now.getTime();
  const deviceDeadline = new Date(expiresAtIso).getTime() - offsetMs;
  const fireAt = deviceDeadline - HOLD_NUDGE_LEAD_MS;
  return fireAt > now.getTime() ? new Date(fireAt) : null;
}

/**
 * When to fire the "check if it's on sale" nudge for a coming-soon film, or
 * `null` when the release date has already passed.
 *
 * This is deliberately not a claim that booking has actually opened — nothing
 * in this system's data model marks the moment a film's `isNowShowing` flag
 * flips (see README's "Next"). It fires on the film's own announced release
 * date and asks the user to check, the same honesty `PLENTY`/`FILLING`/
 * `ALMOST_FULL` bring to seat counts: real information, not invented
 * precision about an event this client cannot actually observe.
 */
export function releaseCheckTime(releaseDateIso: string, now: Date = new Date()): Date | null {
  const releaseAt = new Date(releaseDateIso).getTime();
  return releaseAt > now.getTime() ? new Date(releaseAt) : null;
}
