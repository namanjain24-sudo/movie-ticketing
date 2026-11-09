import type { Booking, MovieSummary } from '@app/shared';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { recordNotificationHistory } from './history';
import { formatDistance } from '../../lib/maps';
import {
  holdNudgeTime,
  leaveReminderTime,
  releaseCheckTime,
  showtimeReminderTime,
} from './scheduling';
import { subjectTitle } from '../catalog/subject';

/**
 * Everything here is best-effort. A booking or a checkout must never fail
 * because a local notification could not be scheduled — web has no scheduled
 * notifications at all, and a device that denied permission should behave
 * exactly like one that was never asked. Every call in this module routes
 * through this one guard rather than repeating the web check and try/catch,
 * so a future addition can't accidentally drop one of them.
 */
async function attempt<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  if (Platform.OS === 'web') return fallback;
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

let handlerInstalled = false;
/** Foreground notifications still show a banner; nothing here plays a sound. */
export function installNotificationHandler() {
  if (handlerInstalled || Platform.OS === 'web') return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Asked once, after the first confirmed booking — never on cold start. The
 * OS itself is the record of whether we already asked: once a person has
 * answered, the status is `granted` or `denied`, never `undetermined` again,
 * so there is nothing to persist here.
 */
export async function requestNotificationPermissionIfUnasked(): Promise<void> {
  await attempt(async () => {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.status !== 'undetermined') return;
    await Notifications.requestPermissionsAsync();
  }, undefined);
}

const showtimeReminderId = (bookingId: string) => `showtime-reminder-${bookingId}`;
const holdNudgeId = (holdId: string) => `hold-nudge-${holdId}`;
const leaveReminderId = (bookingId: string) => `leave-reminder-${bookingId}`;

export async function scheduleShowtimeReminder(booking: Booking) {
  const fireAt = showtimeReminderTime(booking.showtime.startsAt);
  if (!fireAt) return;
  const title = `${subjectTitle(booking.showtime)} starts soon`;
  const body = `Doors at ${booking.showtime.cinema.name}. Head out in time.`;
  await attempt(async () => {
    await Notifications.scheduleNotificationAsync({
      identifier: showtimeReminderId(booking.id),
      content: { title, body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
    });
    await recordNotificationHistory({
      id: showtimeReminderId(booking.id),
      kind: 'showtime-reminder',
      title,
      body,
    });
  }, undefined);
}

/**
 * The second reminder: not "this starts soon" but "go now".
 *
 * Separate from `scheduleShowtimeReminder` rather than replacing it, because
 * they answer different questions and only one of them can always be
 * answered. The flat two-hour notice works without knowing where anybody is;
 * this one needs a position, which is read and never asked for, so most
 * accounts will only ever get the first.
 *
 * `distance` null means no position, and `leaveReminderTime` returns null for
 * it, so nothing is scheduled and nothing is claimed.
 */
export async function scheduleLeaveReminder(booking: Booking, distance: number | null) {
  const fireAt = leaveReminderTime(booking.showtime.startsAt, distance);
  if (!fireAt) return;
  const title = `Time to leave for ${subjectTitle(booking.showtime)}`;
  // The distance is the server's own figure and the only number here. No ETA:
  // the allowance behind the timing is one number for city traffic, not a
  // route, and quoting it would dress a guess up as a calculation.
  const away = formatDistance(distance);
  const body = away
    ? `${booking.showtime.cinema.name} is ${away} away.`
    : `Head out for ${booking.showtime.cinema.name}.`;
  await attempt(async () => {
    await Notifications.scheduleNotificationAsync({
      identifier: leaveReminderId(booking.id),
      content: { title, body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
    });
    await recordNotificationHistory({
      id: leaveReminderId(booking.id),
      kind: 'showtime-reminder',
      title,
      body,
    });
  }, undefined);
}

export async function cancelLeaveReminder(bookingId: string) {
  await attempt(
    () => Notifications.cancelScheduledNotificationAsync(leaveReminderId(bookingId)),
    undefined,
  );
}

/** Cancelling an identifier that was never scheduled is a harmless no-op. */
export async function cancelShowtimeReminder(bookingId: string) {
  await attempt(
    () => Notifications.cancelScheduledNotificationAsync(showtimeReminderId(bookingId)),
    undefined,
  );
}

/**
 * `serverTime` should be as fresh as the caller can make it — `holdNudgeTime`
 * treats it as a same-instant sample against the device clock, the same
 * assumption `useCountdown` makes. A few seconds of staleness (the gap
 * between the hold query's last fetch and this call) is fine for a
 * best-effort nudge; it is not the kind of drift the actual hold mechanic
 * has to defend against.
 */
export async function scheduleHoldExpiryNudge(
  holdId: string,
  expiresAt: string,
  serverTime: string,
) {
  const fireAt = holdNudgeTime(expiresAt, serverTime);
  if (!fireAt) return;
  const title = 'Your seats are about to be released';
  const body = 'Come back and finish paying before the hold runs out.';
  await attempt(async () => {
    await Notifications.scheduleNotificationAsync({
      identifier: holdNudgeId(holdId),
      content: { title, body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
    });
    await recordNotificationHistory({ id: holdNudgeId(holdId), kind: 'hold-nudge', title, body });
  }, undefined);
}

export async function cancelHoldExpiryNudge(holdId: string) {
  await attempt(
    () => Notifications.cancelScheduledNotificationAsync(holdNudgeId(holdId)),
    undefined,
  );
}

const releaseCheckId = (movieId: string) => `release-check-${movieId}`;

/**
 * A release-day check-in for a "Coming soon" film — not a promise that
 * booking has actually opened, since nothing in this system observes that
 * moment (see `releaseCheckTime`). Scheduled entirely client-side: no
 * backend record exists for this, so `isReleaseCheckScheduled` is the only
 * source of truth for whether it's on.
 */
export async function scheduleReleaseCheck(
  movie: Pick<MovieSummary, 'id' | 'title' | 'releaseDate'>,
) {
  const fireAt = releaseCheckTime(movie.releaseDate);
  if (!fireAt) return;
  const title = `${movie.title} may be booking now`;
  const body = 'Open the app to check for showtimes.';
  await attempt(async () => {
    await Notifications.scheduleNotificationAsync({
      identifier: releaseCheckId(movie.id),
      content: { title, body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
    });
    await recordNotificationHistory({
      id: releaseCheckId(movie.id),
      kind: 'release-check',
      title,
      body,
    });
  }, undefined);
}

export async function cancelReleaseCheck(movieId: string) {
  await attempt(
    () => Notifications.cancelScheduledNotificationAsync(releaseCheckId(movieId)),
    undefined,
  );
}

export async function isReleaseCheckScheduled(movieId: string): Promise<boolean> {
  return attempt(async () => {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.some((n) => n.identifier === releaseCheckId(movieId));
  }, false);
}
