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
