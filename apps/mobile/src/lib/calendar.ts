import type { Booking } from '@app/shared';
import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

export type AddToCalendarResult = 'added' | 'permission-denied' | 'unsupported' | 'error';

/**
 * The booking record carries no runtime for the film, so the block reserved
 * is a flat, generous estimate — trailers, an average feature, the walk back
 * to the car — rather than a number pretending to be exact.
 */
const DEFAULT_DURATION_MS = 3 * 60 * 60 * 1000;

/**
 * iOS exposes one calendar as "the" default; Android has no such concept, so
 * the first one this account can actually write to is the closest
 * equivalent.
 */
async function writableCalendar(): Promise<Calendar.ExpoCalendar | null> {
  if (Platform.OS === 'ios') return Calendar.getDefaultCalendarSync();

  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  return (
    calendars.find(
      (c) => c.allowsModifications && c.accessLevel === Calendar.CalendarAccessLevel.OWNER,
    ) ??
    calendars.find((c) => c.allowsModifications) ??
    null
  );
}

/**
 * Adds a showtime to the device calendar. Best-effort in the sense that every
 * failure mode gets its own result rather than a thrown error, but — unlike
 * the notifications module — this only ever runs from a button the user just
 * pressed, so the caller is expected to tell them what happened.
 */
export async function addShowtimeToCalendar(booking: Booking): Promise<AddToCalendarResult> {
  if (Platform.OS === 'web') return 'unsupported';

  try {
    const { status } = await Calendar.requestCalendarPermissions();
    if (status !== 'granted') return 'permission-denied';

    const calendar = await writableCalendar();
    if (!calendar) return 'error';

    const startDate = new Date(booking.showtime.startsAt);
    const endDate = new Date(startDate.getTime() + DEFAULT_DURATION_MS);
    const seats = booking.seats.map((s) => `${s.rowLabel}${s.number}`).join(', ');

    await calendar.createEvent({
      title: booking.showtime.movie.title,
      startDate,
      endDate,
      location: `${booking.showtime.cinema.name}, ${booking.showtime.cinema.address}`,
      notes: `Seats ${seats} · Booking ${booking.reference}`,
    });
    return 'added';
  } catch {
    return 'error';
  }
}
