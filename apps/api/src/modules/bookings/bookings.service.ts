import { createHash, createHmac } from 'node:crypto';
import type {
  Booking,
  BookingList,
  Cancellation,
  CancellationQuote,
  SeatTier,
  ShowFormat,
} from '@app/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { env } from '../../env';
import { refundableMinor } from '../promos/promos.service';
import { HttpError } from '../../http/errors';
import { dbNow, withTxRetry } from '../../lib/tx';
import { logger } from '../../logger';
import { gateway } from '../payments/gateway';
import { publishSeatDeltas } from '../realtime/seat-events';

/**
 * Key for signing ticket QR payloads, derived from the access-token secret
 * with a domain separator. A separate key rather than the same one, so a
 * leaked ticket can never be replayed as a session.
 */
const ticketKey = createHash('sha256').update(`${env.JWT_ACCESS_SECRET}:ticket-qr`).digest();

/**
 * What the QR encodes: enough for a gate scanner to verify the ticket without
 * a round trip, and nothing a scanner could use to book anything.
 */
function qrPayload(input: { reference: string; showtimeId: string; seatCount: number }): string {
  const body = `${input.reference}|${input.showtimeId}|${input.seatCount}`;
  const signature = createHmac('sha256', ticketKey).update(body).digest('base64url').slice(0, 22);
  return `${body}|${signature}`;
}

export function verifyQrPayload(payload: string): boolean {
  const [reference, showtimeId, seatCount, signature] = payload.split('|');
  if (!reference || !showtimeId || !seatCount || !signature) return false;
  return qrPayload({ reference, showtimeId, seatCount: Number(seatCount) }).endsWith(signature);
}

const bookingSelect = {
  id: true,
  reference: true,
  status: true,
  createdAt: true,
  confirmedAt: true,
  subtotalMinor: true,
  feeMinor: true,
  discountMinor: true,
  totalMinor: true,
  promoCode: { select: { code: true } },
  currency: true,
  userId: true,
  showSeats: {
    select: {
      id: true,
      priceMinor: true,
      seat: { select: { rowLabel: true, number: true, tier: true } },
    },
    orderBy: [{ seat: { rowIndex: 'asc' } }, { seat: { columnIndex: 'asc' } }],
  },
  showtime: {
    select: {
      id: true,
      startsAt: true,
      format: true,
      language: true,
      movie: { select: { id: true, title: true, posterUrl: true } },
      screen: {
        select: {
          id: true,
          name: true,
          cinema: { select: { id: true, name: true, city: true, address: true } },
        },
      },
    },
  },
} satisfies Prisma.BookingSelect;

type BookingRow = Awaited<ReturnType<typeof loadOne>>;

async function loadOne(where: { id: string } | { reference: string }) {
  return prisma.booking.findUnique({ where: where as never, select: bookingSelect });
}

function toDto(row: NonNullable<BookingRow>): Booking {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    subtotalMinor: row.subtotalMinor,
    feeMinor: row.feeMinor,
    discountMinor: row.discountMinor,
    promoCode: row.promoCode?.code ?? null,
    totalMinor: row.totalMinor,
    currency: row.currency,
    seats: row.showSeats.map((ss) => ({
      showSeatId: ss.id,
      rowLabel: ss.seat.rowLabel,
      number: ss.seat.number,
      tier: ss.seat.tier as SeatTier,
      priceMinor: ss.priceMinor,
    })),
    showtime: {
      id: row.showtime.id,
      startsAt: row.showtime.startsAt.toISOString(),
      format: row.showtime.format as ShowFormat,
      language: row.showtime.language,
      movie: row.showtime.movie,
      cinema: row.showtime.screen.cinema,
      screen: { id: row.showtime.screen.id, name: row.showtime.screen.name },
    },
    qrPayload: qrPayload({
      reference: row.reference,
      showtimeId: row.showtime.id,
      seatCount: row.showSeats.length,
    }),
  };
}

/**
 * Split by whether the show has started, not by booking date, because that is
 * the only split a user cares about on the tickets screen.
 */
export async function listBookings(userId: string): Promise<BookingList> {
  const rows = await prisma.booking.findMany({
    where: { userId, status: { in: ['CONFIRMED', 'CANCELLED'] } },
    select: bookingSelect,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const now = new Date();
  const upcoming: Booking[] = [];
  const past: Booking[] = [];
  for (const row of rows) {
    (row.showtime.startsAt > now && row.status === 'CONFIRMED' ? upcoming : past).push(toDto(row));
  }
  upcoming.sort((a, b) => a.showtime.startsAt.localeCompare(b.showtime.startsAt));

  return { upcoming, past };
}

export async function getBooking(params: { userId: string; id: string }): Promise<Booking> {
  const row = await loadOne({ id: params.id });
  // 404 rather than 403, so booking ids cannot be probed.
  if (!row || row.userId !== params.userId) throw HttpError.notFound('That booking does not exist');
  return toDto(row);
}

export async function getBookingByReference(params: {
  userId: string;
  reference: string;
}): Promise<Booking> {
  const row = await loadOne({ reference: params.reference.toUpperCase() });
  if (!row || row.userId !== params.userId) throw HttpError.notFound('That booking does not exist');
  return toDto(row);
}

/**
 * Cancels a confirmed booking and puts its seats back on sale.
 *
 * The seats are the part that has to be right: they are released inside the
 * same transaction that marks the booking cancelled, so there is no window in
 * which a seat belongs to a cancelled booking, and no window in which it
 * belongs to nobody while the booking still claims it.
 *
 * The booking fee is kept and the seat money is returned, which is the
 * convention every Indian ticketing platform follows. The payment row is moved
 * to REFUNDED inside the transaction and the gateway is called after it
 * commits: a refund the gateway has not yet acknowledged is safer to have
 * recorded than to have lost, and reconciliation reads the same rows.
 */
export async function cancelBooking(params: {
  userId: string;
  bookingId: string;
}): Promise<Cancellation> {
  const outcome = await withTxRetry(
    async (tx) => {
      const now = await dbNow(tx);

      // Lock the booking so two taps on Cancel cannot both refund.
      const locked = await tx.$queryRaw<{ id: string; status: string }[]>`
        SELECT id, status::text AS status FROM "Booking"
        WHERE id = ${params.bookingId} AND "userId" = ${params.userId}
        FOR UPDATE
      `;
      if (locked.length === 0) throw HttpError.notFound('That booking does not exist');

      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: params.bookingId },
        select: {
          id: true,
          reference: true,
          status: true,
          subtotalMinor: true,
          feeMinor: true,
          discountMinor: true,
          currency: true,
          showtimeId: true,
          showtime: { select: { startsAt: true } },
          payments: { select: { id: true, status: true, providerRef: true } },
        },
      });

      if (booking.status === 'CANCELLED') {
        throw HttpError.notCancellable('This booking is already cancelled');
      }
      if (booking.status !== 'CONFIRMED') {
        throw HttpError.notCancellable('Only a confirmed booking can be cancelled');
      }

      const deadline = cancellationDeadline(booking.showtime.startsAt);
      if (now >= deadline) throw HttpError.cancellationClosed(deadline);

      // Hand the seats back. `holdId` and `holdExpiresAt` are cleared too, or
      // the seat would read as available while still pointing at a dead hold —
      // which is exactly what the `available-seat-is-clean` invariant forbids.
      const released = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "ShowSeat"
        SET state = 'AVAILABLE', "bookingId" = NULL, "holdId" = NULL, "holdExpiresAt" = NULL
        WHERE "bookingId" = ${booking.id}
        RETURNING id
      `;

      await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'CANCELLED', cancelledAt: now },
      });

      const captured = booking.payments.find((p) => p.status === 'CAPTURED');
      if (captured) {
        await tx.payment.update({
          where: { id: captured.id },
          data: { status: 'REFUNDED', failureReason: 'Cancelled by the customer' },
        });
      }

      return {
        booking,
        now,
        releasedShowSeatIds: released.map((r) => r.id),
        refundProviderRef: captured?.providerRef ?? null,
      };
    },
    { label: 'cancelBooking' },
  );

  const { booking, now, releasedShowSeatIds, refundProviderRef } = outcome;

  const refundMinor = refundableMinor(booking);

  // A fully discounted booking has nothing to send back, and a zero refund is
  // not something a gateway accepts.
  if (refundProviderRef && refundMinor > 0) {
    try {
      await gateway.refund({
        providerRef: refundProviderRef,
        amountMinor: refundMinor,
        reason: `Cancellation of ${booking.reference}`,
      });
    } catch (err) {
      // The row already says REFUNDED, so reconciliation owns the retry. The
      // alternative — rolling the cancellation back — would leave the user
      // holding seats they have been told are gone.
      logger.error(
        { err, bookingId: booking.id, providerRef: refundProviderRef },
        'Refund call failed after cancellation committed; left for reconciliation',
      );
    }
  }

  await publishSeatDeltas(
    booking.showtimeId,
    releasedShowSeatIds.map((showSeatId) => ({ showSeatId, status: 'AVAILABLE' as const })),
  );

  return {
    bookingId: booking.id,
    reference: booking.reference,
    status: 'CANCELLED',
    refundMinor: refundableMinor(booking),
    feeRetainedMinor: booking.feeMinor,
    currency: booking.currency,
    cancelledAt: now.toISOString(),
    releasedShowSeatIds,
  };
}

/** The instant after which a booking can no longer be cancelled. */
function cancellationDeadline(startsAt: Date): Date {
  return new Date(startsAt.getTime() - env.CANCELLATION_WINDOW_MINUTES * 60_000);
}

/**
 * What the user is shown before they commit. Quoting the refund up front is the
 * difference between a cancellation flow people trust and one they avoid.
 */
export async function quoteCancellation(params: {
  userId: string;
  bookingId: string;
}): Promise<CancellationQuote> {
  const now = await dbNow(prisma);
  const booking = await prisma.booking.findFirst({
    where: { id: params.bookingId, userId: params.userId },
    select: {
      status: true,
      subtotalMinor: true,
      feeMinor: true,
      discountMinor: true,
      currency: true,
      showtime: { select: { startsAt: true } },
    },
  });
  if (!booking) throw HttpError.notFound('That booking does not exist');

  const deadline = cancellationDeadline(booking.showtime.startsAt);
  const reason =
    booking.status === 'CANCELLED'
      ? 'This booking is already cancelled'
      : booking.status !== 'CONFIRMED'
        ? 'Only a confirmed booking can be cancelled'
        : now >= deadline
          ? 'Cancellation closes two hours before the screening'
          : null;

  return {
    cancellable: reason === null,
    refundMinor: refundableMinor(booking),
    feeRetainedMinor: booking.feeMinor,
    currency: booking.currency,
    deadline: deadline.toISOString(),
    serverTime: now.toISOString(),
    reason,
  };
}
