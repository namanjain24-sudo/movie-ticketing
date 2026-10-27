import type { Booking, EventKind } from '@app/shared';
import { STORAGE_KEYS, secureStorage } from '../../lib/storage';
import { subjectTitle } from '../catalog/subject';

/**
 * A ticket you can still open with no signal.
 *
 * The QR has always been verifiable offline — it is an HMAC over the
 * reference, the showtime and the seat count, and `verifyQrPayload` on the
 * server needs no database to check it. The gap was on this side: the ticket
 * screen reads from TanStack Query, which keeps its cache in memory only, so
 * the one place a person most needs their ticket — a cinema foyer, a basement
 * multiplex, a phone with no data left — was the one place the app could not
 * produce it. That is not a ticket.
 *
 * This is deliberately *not* a persisted query cache. Seat maps, showtimes and
 * balances all going stale on disk is a much larger promise than anyone needs
 * here, and a stale seat map is actively harmful. One confirmed ticket,
 * written when it is confirmed, read only when the network has failed.
 */
export interface SavedTicket {
  reference: string;
  /** As it was when saved. A ticket cancelled since will still say CONFIRMED. */
  status: Booking['status'];
  qrPayload: string;
  movieTitle: string;
  cinema: string;
  screen: string;
  startsAt: string;
  format: Booking['showtime']['format'];
  language: string;
  /**
   * Set only for a match, gig or workshop. Optional because tickets saved
   * before this field existed will not have it, and a ticket already in the
   * vault is the one thing here that must never fail to open — those fall
   * back to `format`, which is the same thing they have always shown.
   */
  eventKind?: EventKind;
  /** Already formatted as "H10, H11", because that is all the stub shows. */
  seats: string;
  totalMinor: number;
  currency: string;
  /** When this copy was taken, so the screen can say how old it is. */
  savedAt: string;
}

/**
 * One key per ticket rather than a single list, and a trimmed projection
 * rather than the API's own payload.
 *
 * A list in one key is a value with no upper bound on its size, which is the
 * shape of thing that works in testing and fails for the one person who has
 * used the app the most. Expo's own documentation is careful rather than
 * absolute about this — "historically, some iOS releases refused values above
 * roughly 2048 bytes", with nothing enforced in the library — and Android
 * stores these in `SharedPreferences`, which has no such limit. So this is not
 * a line anyone is standing on top of; it is a reason not to build something
 * that grows without a ceiling when a fixed-size alternative costs nothing.
 *
 * For scale: a real two-seat booking comes back from the API at 1,149 bytes,
 * and a ten-seat one is over two thousand on its own. The projection below is
 * under a kilobyte at ten seats, and the index stays tiny no matter how many
 * tickets it names.
 */
const MAX_TICKETS = 12;
const entryKey = (reference: string) => `${STORAGE_KEYS.savedTicketPrefix}${reference}`;

export function toSavedTicket(booking: Booking): SavedTicket {
  const { showtime } = booking;
  return {
    reference: booking.reference,
    status: booking.status,
    qrPayload: booking.qrPayload,
    movieTitle: subjectTitle(showtime),
    cinema: `${showtime.cinema.name}, ${showtime.cinema.city}`,
    screen: showtime.screen.name,
    startsAt: showtime.startsAt,
    format: showtime.format,
    language: showtime.language,
    ...(showtime.event ? { eventKind: showtime.event.kind } : {}),
    seats: booking.seats.map((s) => `${s.rowLabel}${s.number}`).join(', '),
    totalMinor: booking.totalMinor,
    currency: booking.currency,
    savedAt: new Date().toISOString(),
  };
}

async function readIndex(): Promise<string[]> {
  const raw = await secureStorage.get(STORAGE_KEYS.savedTicketIndex);
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    // Corrupt or pre-format data is not worth failing a ticket over.
    return [];
  }
}

/**
 * Keeps the newest `MAX_TICKETS` and drops the rest, entry and index together.
 * Never throws: a ticket that cannot be cached is a missing convenience, and
 * the caller is a screen that has a perfectly good live ticket on it already.
 */
export async function saveTicket(booking: Booking): Promise<void> {
  if (booking.status !== 'CONFIRMED') return;
  try {
    const saved = toSavedTicket(booking);
    await secureStorage.set(entryKey(saved.reference), JSON.stringify(saved));

    const index = [saved.reference, ...(await readIndex()).filter((r) => r !== saved.reference)];
    const kept = index.slice(0, MAX_TICKETS);
    await secureStorage.set(STORAGE_KEYS.savedTicketIndex, JSON.stringify(kept));
    await Promise.all(index.slice(MAX_TICKETS).map((r) => secureStorage.remove(entryKey(r))));
  } catch {
    // See above.
  }
}

/**
 * Every ticket this device has kept, newest first.
 *
 * The saved ticket was reachable only by its own URL, and the one route to
 * that URL is the bookings list — which needs the network. So on a phone with
 * no signal the copy existed, was correct, and could not be opened by anybody
 * who did not already know the booking reference. Tested in airplane mode on
 * a real device, which is the only way that shows up.
 */
export async function listSavedTickets(): Promise<SavedTicket[]> {
  const references = await readIndex();
  const tickets = await Promise.all(references.map((r) => readSavedTicket(r)));
  return tickets.filter((t): t is SavedTicket => t !== null);
}

export async function readSavedTicket(reference: string): Promise<SavedTicket | null> {
  const raw = await secureStorage.get(entryKey(reference));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as SavedTicket;
    // A copy written by an older build may be missing what the screen needs.
    return value?.reference && value.qrPayload ? value : null;
  } catch {
    return null;
  }
}

/**
 * Called when a booking is cancelled, so the offline copy cannot outlive the
 * thing it is a copy of. It can still go stale the other way — cancelled on
 * another device, say — which is why the screen that shows it says when it was
 * taken rather than claiming it is current.
 */
export async function forgetTicket(reference: string): Promise<void> {
  await secureStorage.remove(entryKey(reference));
  const index = (await readIndex()).filter((r) => r !== reference);
  await secureStorage.set(STORAGE_KEYS.savedTicketIndex, JSON.stringify(index));
}
