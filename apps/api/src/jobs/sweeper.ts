import type { SeatDelta } from '@app/shared';
import { prisma } from '../db';
import { env } from '../env';
import { purgeExpiredIdempotencyRecords } from '../lib/idempotency';
import { logger } from '../logger';
import { reverseRedemption } from '../modules/loyalty/loyalty.service';
import { reconcilePendingPayments } from '../modules/payments/payments.service';
import { publishSeatDeltas } from '../modules/realtime/seat-events';

/**
 * Housekeeping, and nothing more.
 *
 * Hold expiry is already correct without this job: every read path and every
 * locking query treats `holdExpiresAt <= now()` as available, so a seat is
 * free the instant its hold lapses whether or not anything has run. See
 * holds.service.ts.
 *
 * What the sweeper adds is tidiness and visibility. It clears stale rows so
 * the tables read honestly, and it emits the release events the realtime
 * channel needs, because a seat that quietly becomes available has no other
 * way to tell the clients watching it.
 *
 * The distinction matters: if this process never runs, the system still never
 * oversells. That is the property the invariant script asserts, and it is why
 * a missed tick is an inconvenience rather than an incident.
 */

export interface SweepResult {
  seatsReleased: number;
  holdsExpired: number;
  bookingsCancelled: number;
  idempotencyPurged: number;
}

export async function sweepOnce(): Promise<SweepResult> {
  const released = await prisma.$queryRaw<{ id: string; showtimeId: string }[]>`
    UPDATE "ShowSeat"
    SET state = 'AVAILABLE', "holdId" = NULL, "holdExpiresAt" = NULL, "bookingId" = NULL
    WHERE state = 'HELD' AND "holdExpiresAt" <= now()
    RETURNING id, "showtimeId"
  `;

  const { count: holdsExpired } = await prisma.hold.updateMany({
    where: { status: 'ACTIVE', expiresAt: { lte: new Date() } },
    data: { status: 'EXPIRED', releasedAt: new Date() },
  });

  // A booking whose hold lapsed before payment landed is dead. Cancelling it
  // here keeps "PENDING" meaning "still payable" rather than "possibly
  // abandoned weeks ago". Fetched before the update (rather than a plain
  // `updateMany`) so any points it redeemed can be handed back the same way
  // an explicit cancellation does — this is the common "abandoned checkout"
  // path, unlike payments.service.ts's reversal, which only covers a capture
  // that arrives after the hold already expired.
  const dead = await prisma.booking.findMany({
    where: { status: 'PENDING', hold: { status: { in: ['EXPIRED', 'RELEASED'] } } },
    select: { id: true, userId: true, pointsRedeemed: true },
  });
  if (dead.length > 0) {
    await prisma.booking.updateMany({
      where: { id: { in: dead.map((b) => b.id) } },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        failureReason: 'The hold expired before payment completed',
      },
    });
    for (const booking of dead) {
      await reverseRedemption(prisma, {
        userId: booking.userId,
        bookingId: booking.id,
        points: booking.pointsRedeemed,
      });
    }
  }
  const bookingsCancelled = dead.length;

  const idempotencyPurged = await purgeExpiredIdempotencyRecords();

  // Group the released seats per showtime so each channel gets one message.
  const byShowtime = new Map<string, SeatDelta[]>();
  for (const row of released) {
    const list = byShowtime.get(row.showtimeId) ?? [];
    list.push({ showSeatId: row.id, status: 'AVAILABLE' });
    byShowtime.set(row.showtimeId, list);
  }
  for (const [showtimeId, deltas] of byShowtime) {
    await publishSeatDeltas(showtimeId, deltas);
  }

  return {
    seatsReleased: released.length,
    holdsExpired,
    bookingsCancelled,
    idempotencyPurged,
  };
}

let timer: NodeJS.Timeout | undefined;

export function startSweeper(): void {
  if (!env.SWEEPER_ENABLED || timer) return;

  const tick = async () => {
    try {
      const result = await sweepOnce();
      if (result.seatsReleased > 0 || result.bookingsCancelled > 0) {
        logger.info(result, 'Sweeper released expired holds');
      }
      await reconcilePendingPayments();
    } catch (err) {
      // Never fatal. The next tick tries again, and correctness does not
      // depend on any tick succeeding.
      logger.error({ err }, 'Sweeper tick failed');
    }
  };

  timer = setInterval(() => void tick(), env.SWEEPER_INTERVAL_SECONDS * 1000);
  timer.unref();
  logger.info({ everySeconds: env.SWEEPER_INTERVAL_SECONDS }, 'Sweeper started');
}

export function stopSweeper(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
