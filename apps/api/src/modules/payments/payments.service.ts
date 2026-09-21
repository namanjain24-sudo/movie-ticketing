import { createHash } from 'node:crypto';
import type { CheckoutResult, PaymentStatusResult, SeatDelta } from '@app/shared';
import type { PaymentStatus } from '@prisma/client';
import { prisma, type Tx } from '../../db';
import { env } from '../../env';
import { HttpError } from '../../http/errors';
import { bookingReference } from '../../lib/reference';
import { dbNow, withTxRetry } from '../../lib/tx';
import { logger } from '../../logger';
import { bookingFeeMinor, lockActiveHold } from '../holds/holds.service';
import { evaluatePromo } from '../promos/promos.service';
import { publishSeatDeltas } from '../realtime/seat-events';
import { gateway, type GatewayWebhookEvent } from './gateway';

/**
 * Checkout turns a hold into a booking and starts a payment. Confirmation is
 * never written here: seats stay HELD until a signed gateway callback says the
 * money moved. Trusting the client's "it worked" is how a system confirms
 * seats for a payment that later declines.
 */

/**
 * Our own payment reference, derived from the idempotency key. Deterministic
 * on purpose: a retry produces the same reference, so the gateway treats it as
 * the same attempt and cannot open a second charge.
 */
function providerRefFor(idempotencyKey: string): string {
  const digest = createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 24);
  return `pay_${digest}`;
}

export interface CheckoutParams {
  userId: string;
  holdId: string;
  method: string;
  /** Only read when this call creates the booking; see `checkoutSchema`. */
  promoCode?: string;
  idempotencyKey: string;
}

export async function checkout(params: CheckoutParams): Promise<CheckoutResult> {
  const providerRef = providerRefFor(params.idempotencyKey);

  const prepared = await withTxRetry(
    async (tx) => {
      const now = await dbNow(tx);
      const hold = await lockActiveHold(tx, {
        holdId: params.holdId,
        userId: params.userId,
      });

      // A hold has at most one booking, enforced by a unique constraint. A
      // second checkout after a declined payment therefore reuses the booking
      // and only opens a new payment attempt, which is what "retry in place"
      // means. The price is fixed when the booking is created, so a retry pays
      // exactly what the first attempt was quoted, code or no code.
      const existing = await tx.booking.findUnique({
        where: { holdId: params.holdId },
        select: { id: true, reference: true, status: true, totalMinor: true },
      });

      let booking = existing;
      if (!booking) {
        const subtotalMinor = hold.seats.reduce((sum, s) => sum + s.priceMinor, 0);
        const feeMinor = bookingFeeMinor();

        // Inside this transaction and under the promo row's lock, so the limit
        // it enforces holds against concurrent checkouts.
        const applied = params.promoCode
          ? await evaluatePromo(tx, {
              code: params.promoCode,
              userId: params.userId,
              subtotalMinor,
              feeMinor,
              lock: true,
            })
          : null;
        const discountMinor = applied?.discountMinor ?? 0;

        booking = await createBooking(tx, {
          holdId: params.holdId,
          userId: params.userId,
          showtimeId: hold.showtimeId,
          currency: hold.currency,
          subtotalMinor,
          feeMinor,
          discountMinor,
          promoCodeId: applied?.promo.id ?? null,
          totalMinor: subtotalMinor + feeMinor - discountMinor,
          showSeatIds: hold.seats.map((s) => s.id),
        });
      }
      const totalMinor = booking.totalMinor;

      if (booking.status === 'CONFIRMED') {
        throw HttpError.conflict('This booking has already been paid for');
      }

      // Written inside the transaction, before the gateway is called, because
      // `providerRef` is ours to choose. If the process dies immediately after
      // this commit, reconciliation can still find the charge.
      const payment = await tx.payment.upsert({
        where: { providerRef },
        create: {
          bookingId: booking.id,
          provider: gateway.name,
          providerRef,
          status: 'PENDING',
          amountMinor: totalMinor,
          currency: hold.currency,
          idempotencyKey: params.idempotencyKey,
        },
        update: {},
        select: { id: true, status: true },
      });

      return {
        bookingId: booking.id,
        reference: booking.reference,
        paymentId: payment.id,
        paymentStatus: payment.status,
        amountMinor: totalMinor,
        currency: hold.currency,
        expiresAt: hold.expiresAt,
        serverTime: now,
      };
    },
    { label: 'checkout' },
  );

  // Outside the transaction: a slow gateway must not hold seat locks open.
  const intent = await gateway.createIntent({
    providerRef,
    amountMinor: prepared.amountMinor,
    currency: prepared.currency,
    method: params.method,
    description: `Booking ${prepared.reference}`,
  });

  return {
    bookingId: prepared.bookingId,
    reference: prepared.reference,
    paymentId: prepared.paymentId,
    clientSecret: intent.clientSecret,
    status: prepared.paymentStatus,
    amountMinor: prepared.amountMinor,
    currency: prepared.currency,
    expiresAt: prepared.expiresAt.toISOString(),
    serverTime: prepared.serverTime.toISOString(),
  };
}

async function createBooking(
  tx: Tx,
  input: {
    holdId: string;
    userId: string;
    showtimeId: string;
    currency: string;
    subtotalMinor: number;
    feeMinor: number;
    discountMinor: number;
    promoCodeId: string | null;
    totalMinor: number;
    showSeatIds: string[];
  },
) {
  const booking = await tx.booking.create({
    data: {
      reference: bookingReference(),
      holdId: input.holdId,
      userId: input.userId,
      showtimeId: input.showtimeId,
      status: 'PENDING',
      subtotalMinor: input.subtotalMinor,
      feeMinor: input.feeMinor,
      discountMinor: input.discountMinor,
      promoCodeId: input.promoCodeId,
      totalMinor: input.totalMinor,
      currency: input.currency,
    },
    select: { id: true, reference: true, status: true, totalMinor: true },
  });

  // The seats stay HELD. Attaching the booking now only records intent, so
  // that a webhook arriving later knows which seats to confirm.
  await tx.showSeat.updateMany({
    where: { id: { in: input.showSeatIds } },
    data: { bookingId: booking.id },
  });

  return booking;
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

/** Higher wins. Used so an out-of-order callback cannot walk a payment back. */
const STATUS_RANK: Record<PaymentStatus, number> = {
  PENDING: 0,
  AUTHORIZED: 1,
  CAPTURED: 2,
  FAILED: 2,
  REFUNDED: 3,
};

/**
 * Entry point for gateway callbacks.
 *
 * Deduplication is the insert itself: `WebhookEvent.id` is the gateway's own
 * event id, so a duplicate delivery loses the primary-key race and is
 * acknowledged without being processed again. No lookup-then-insert, because
 * that has the same read-then-write race as the naive seat check.
 */
export async function handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<void> {
  const event = gateway.parseWebhook(rawBody, signature);
  if (!event) throw HttpError.badRequest('Invalid webhook signature');

  const inserted = await prisma.$executeRaw`
    INSERT INTO "WebhookEvent" ("id", "provider", "type", "payload", "receivedAt")
    VALUES (${event.id}, ${gateway.name}, ${event.type}, ${JSON.stringify(event)}::jsonb, now())
    ON CONFLICT ("id") DO NOTHING
  `;

  if (inserted === 0) {
    logger.debug({ eventId: event.id }, 'Duplicate webhook ignored');
    return;
  }

  try {
    await processEvent(event);
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date() },
    });
  } catch (err) {
    // Left unprocessed on purpose: reconciliation picks it up, and the row is
    // the audit trail for why a payment is stuck.
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}

async function processEvent(event: GatewayWebhookEvent): Promise<void> {
  switch (event.type) {
    case 'payment.authorized':
      await advancePaymentStatus(event.providerRef, 'AUTHORIZED');
      return;
    case 'payment.captured':
      await confirmBooking(event.providerRef);
      return;
    case 'payment.failed':
      await failPayment(event.providerRef, event.failureReason ?? 'Payment declined');
      return;
    default:
      logger.warn({ event }, 'Unhandled webhook type');
  }
}

async function advancePaymentStatus(providerRef: string, next: PaymentStatus): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { providerRef },
    select: { id: true, status: true },
  });
  if (!payment) {
    logger.warn({ providerRef }, 'Webhook for unknown payment');
    return;
  }
  if (STATUS_RANK[next] <= STATUS_RANK[payment.status]) return;
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: next, authorizedAt: next === 'AUTHORIZED' ? new Date() : undefined },
  });
}

/**
 * The money moved, so the seats become the user's. This is the only place a
 * seat reaches CONFIRMED.
 *
 * The late-capture case is handled rather than assumed away: if the hold ran
 * out before the capture landed, the seats are already back on sale and
 * confirming them would oversell. The payment is marked for refund and the
 * booking fails, which is the honest outcome.
 */
export async function confirmBooking(providerRef: string): Promise<void> {
  const outcome = await withTxRetry(
    async (tx) => {
      const now = await dbNow(tx);

      const payment = await tx.payment.findUnique({
        where: { providerRef },
        select: {
          id: true,
          status: true,
          bookingId: true,
          booking: { select: { id: true, status: true, holdId: true, showtimeId: true } },
        },
      });
      if (!payment) {
        logger.warn({ providerRef }, 'Capture for unknown payment');
        return null;
      }
      if (payment.booking.status === 'CONFIRMED') return null; // Already done.
      if (payment.status === 'REFUNDED') return null;

      // Lock the seats this booking is claiming and re-check they are still
      // held. Between the gateway call and this callback the hold may have
      // expired and the seats may belong to someone else.
      const seats = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "ShowSeat"
        WHERE "bookingId" = ${payment.booking.id}
          AND "holdId" = ${payment.booking.holdId}
          AND state = 'HELD'
          AND "holdExpiresAt" > now()
        ORDER BY id
        FOR UPDATE
      `;

      const expectedSeatCount = await tx.hold.findUnique({
        where: { id: payment.booking.holdId },
        select: { seatCount: true },
      });

      if (seats.length === 0 || seats.length !== expectedSeatCount?.seatCount) {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'REFUNDED',
            failureReason: 'Hold expired before the payment was captured',
            capturedAt: now,
          },
        });
        await tx.booking.update({
          where: { id: payment.booking.id },
          data: {
            status: 'FAILED',
            failureReason: 'Hold expired before the payment was captured',
            cancelledAt: now,
          },
        });
        logger.error(
          { providerRef, bookingId: payment.booking.id },
          'Capture arrived after hold expiry; payment marked for refund',
        );
        return { showtimeId: payment.booking.showtimeId, deltas: [] as SeatDelta[] };
      }

      const seatIds = seats.map((s) => s.id);
      await tx.showSeat.updateMany({
        where: { id: { in: seatIds } },
        data: { state: 'CONFIRMED', holdExpiresAt: null },
      });
      await tx.hold.update({
        where: { id: payment.booking.holdId },
        data: { status: 'CONVERTED' },
      });
      await tx.booking.update({
        where: { id: payment.booking.id },
        data: { status: 'CONFIRMED', confirmedAt: now, failureReason: null },
      });
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'CAPTURED', capturedAt: now, authorizedAt: now },
      });

      return {
        showtimeId: payment.booking.showtimeId,
        deltas: seatIds.map<SeatDelta>((id) => ({ showSeatId: id, status: 'SOLD' })),
      };
    },
    { label: 'confirmBooking' },
  );

  if (outcome) await publishSeatDeltas(outcome.showtimeId, outcome.deltas);
}

/**
 * A decline kills the attempt, not the booking. The hold keeps ticking and the
 * user can pay again in place, which is the difference between a retry and
 * being thrown back to the seat map.
 */
export async function failPayment(providerRef: string, reason: string): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { providerRef },
    select: { id: true, status: true },
  });
  if (!payment) return;
  if (STATUS_RANK.FAILED <= STATUS_RANK[payment.status] && payment.status !== 'PENDING') {
    // Already terminal. A failure arriving after a capture is a gateway
    // contradiction, not something to act on.
    if (payment.status === 'CAPTURED') {
      logger.error({ providerRef }, 'Received a decline for an already captured payment');
    }
    return;
  }
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'FAILED', failureReason: reason },
  });
}

// ---------------------------------------------------------------------------
// Polling and reconciliation
// ---------------------------------------------------------------------------

/** Backs the "confirming..." screen: the client polls until this is terminal. */
export async function getPaymentStatus(params: {
  userId: string;
  paymentId: string;
}): Promise<PaymentStatusResult> {
  const payment = await prisma.payment.findUnique({
    where: { id: params.paymentId },
    select: {
      id: true,
      status: true,
      failureReason: true,
      booking: {
        select: { id: true, userId: true, status: true, reference: true },
      },
    },
  });
  if (!payment || payment.booking.userId !== params.userId) {
    throw HttpError.notFound('That payment does not exist');
  }

  return {
    paymentId: payment.id,
    bookingId: payment.booking.id,
    status: payment.status,
    bookingStatus: payment.booking.status,
    failureReason: payment.failureReason,
    reference: payment.booking.status === 'CONFIRMED' ? payment.booking.reference : null,
  };
}

/**
 * Resolves payments the webhook never settled: a dropped callback, a crash
 * between the commit and the gateway call, a gateway that was down.
 *
 * This is the path that decides whether a user who was charged ends up with a
 * ticket, so it asks the gateway rather than guessing from local state.
 */
export async function reconcilePendingPayments(options: { olderThanMs?: number } = {}): Promise<{
  checked: number;
  confirmed: number;
  failed: number;
  unresolved: number;
}> {
  const cutoff = new Date(Date.now() - (options.olderThanMs ?? 60_000));
  /**
   * How long a payment the gateway has never heard of is left alone before it
   * is written off. A gateway that answers "no such payment" may simply not
   * have caught up, and marking a real charge as failed is far worse than
   * leaving it pending for another pass.
   */
  const writeOffAfter = new Date(Date.now() - 15 * 60_000);

  const stuck = await prisma.payment.findMany({
    where: { status: { in: ['PENDING', 'AUTHORIZED'] }, createdAt: { lt: cutoff } },
    select: { id: true, providerRef: true, createdAt: true },
    take: 200,
  });

  let confirmed = 0;
  let failed = 0;
  let unresolved = 0;

  for (const payment of stuck) {
    const intent = await gateway.fetchIntent(payment.providerRef).catch(() => undefined);
    if (intent === undefined) {
      // The gateway could not be reached. Local state stays as it is; the next
      // pass tries again.
      unresolved++;
      continue;
    }
    if (intent === null) {
      if (payment.createdAt > writeOffAfter) {
        unresolved++;
        continue;
      }
      // Old enough, and the gateway still has no record: no money moved.
      await failPayment(payment.providerRef, 'Payment was never started at the gateway');
      failed++;
      continue;
    }
    if (intent.status === 'CAPTURED') {
      await confirmBooking(payment.providerRef);
      confirmed++;
    } else if (intent.status === 'FAILED') {
      await failPayment(payment.providerRef, intent.failureReason ?? 'Payment declined');
      failed++;
    }
  }

  if (stuck.length > 0) {
    logger.info(
      { checked: stuck.length, confirmed, failed, unresolved },
      'Reconciliation pass complete',
    );
  }
  return { checked: stuck.length, confirmed, failed, unresolved };
}

export const __testing = { providerRefFor, STATUS_RANK, feeMinor: () => env.BOOKING_FEE_MINOR };
