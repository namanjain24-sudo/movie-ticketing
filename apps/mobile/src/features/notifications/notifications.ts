import type { Booking, MovieSummary } from '@app/shared';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { holdNudgeTime, releaseCheckTime, showtimeReminderTime } from './scheduling';

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

export async function scheduleShowtimeReminder(booking: Booking) {
  const fireAt = showtimeReminderTime(booking.showtime.startsAt);
  if (!fireAt) return;
  await attempt(
    () =>
      Notifications.scheduleNotificationAsync({
        identifier: showtimeReminderId(booking.id),
        content: {
          title: `${booking.showtime.movie.title} starts soon`,
          body: `Doors at ${booking.showtime.cinema.name}. Head out in time.`,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
      }),
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
export async function scheduleHoldExpiryNudge(holdId: string, expiresAt: string, serverTime: string) {
  const fireAt = holdNudgeTime(expiresAt, serverTime);
  if (!fireAt) return;
  await attempt(
    () =>
      Notifications.scheduleNotificationAsync({
        identifier: holdNudgeId(holdId),
        content: {
          title: 'Your seats are about to be released',
          body: 'Come back and finish paying before the hold runs out.',
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
      }),
    undefined,
  );
}

export async function cancelHoldExpiryNudge(holdId: string) {
  await attempt(() => Notifications.cancelScheduledNotificationAsync(holdNudgeId(holdId)), undefined);
}

const releaseCheckId = (movieId: string) => `release-check-${movieId}`;

/**
 * A release-day check-in for a "Coming soon" film — not a promise that
 * booking has actually opened, since nothing in this system observes that
 * moment (see `releaseCheckTime`). Scheduled entirely client-side: no
 * backend record exists for this, so `isReleaseCheckScheduled` is the only
 * source of truth for whether it's on.
 */
export async function scheduleReleaseCheck(movie: Pick<MovieSummary, 'id' | 'title' | 'releaseDate'>) {
  const fireAt = releaseCheckTime(movie.releaseDate);
  if (!fireAt) return;
  await attempt(
    () =>
      Notifications.scheduleNotificationAsync({
        identifier: releaseCheckId(movie.id),
        content: {
          title: `${movie.title} may be booking now`,
          body: 'Open the app to check for showtimes.',
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
      }),
    undefined,
  );
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
