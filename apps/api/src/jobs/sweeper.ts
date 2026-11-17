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

/**
 * How long a revoked refresh token is kept so reuse detection can still
 * recognise it. A week is far longer than any legitimate client needs to
 * notice it has been rotated, and short enough that the table does not grow
 * without bound.
 */
const REFRESH_REUSE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How long a screening nobody booked is kept after it has happened.
 *
 * Three days is far longer than anything reads one. Nothing in the app asks
 * for a past screening that was never sold: the listings are future-only, a
 * ticket is read through its booking, and `extend-showtimes` derives its
 * pattern from the *latest* day on a screen, never an old one.
 */
const SPENT_SHOWTIME_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Screenings removed per tick.
 *
 * One screening is roughly 260 seat rows, so this is about 50,000 rows a
 * tick — enough to clear a day's backlog in a few minutes of sweeping, small
 * enough that no single statement holds a lock worth noticing. A deployment
 * that has been running for weeks before this shipped works through its
 * backlog over a few hours rather than in one enormous delete.
 */
const SPENT_SHOWTIME_BATCH = 200;

export interface SweepResult {
  seatsReleased: number;
  holdsExpired: number;
  bookingsCancelled: number;
  idempotencyPurged: number;
  refreshTokensPurged: number;
  spentShowtimesPurged: number;
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

  /**
   * Refresh tokens were the one table nothing ever cleaned.
   *
   * Rotation writes a row per refresh and revokes the previous one, and both
   * stay forever. A client refreshing on a loop writes rows faster than any
   * human uses the app, and on a free-tier Postgres that is the table that
   * fills the disk first.
   *
   * Only rows that can no longer authenticate anything are removed: expired,
   * or revoked long enough ago that reuse detection has nothing left to catch.
   * A revoked token still inside that window has to stay, because recognising
   * it is what proves a stolen token was replayed.
   */
  const reuseWindow = new Date(Date.now() - REFRESH_REUSE_RETENTION_MS);
  const { count: refreshTokensPurged } = await prisma.refreshToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lte: new Date() } }, { revokedAt: { lte: reuseWindow } }],
    },
  });

  /**
   * Screenings that have happened and that nobody booked.
   *
   * This is the table that actually fills the disk, and by a distance. The
   * note above says refresh tokens were "the one table nothing ever cleaned";
   * they are 25 rows. `ShowSeat` is 583,000 rows and 249 MB on a fresh seed,
   * because a seat map is one row per seat per screening — about 260 rows a
   * screening, 82,000 rows and 35 MB for every day of schedule.
   *
   * And the schedule only ever grows. `extend-showtimes` runs on every boot
   * and keeps ten days on sale; nothing has ever removed the days that fell
   * off the back. On a free-tier Postgres with a gigabyte to spend, that is
   * about three weeks from seed to a database that cannot be written to, and
   * the first thing that fails is a booking.
   *
   * What is deleted is only a screening with no booking against it. That
   * matters more than the retention window does: `Booking.showtimeId` is
   * ON DELETE CASCADE, so removing a screening somebody bought a seat at
   * would take their ticket, their split shares and their loyalty history
   * with it. A screening nobody bought has nothing hanging off it but its own
   * inventory, its tier prices, its expired holds and any plan option that
   * pointed at it — all of which are over.
   *
   * Batched, and `id IN (...)` rather than a join, so the planner is given an
   * ordered, bounded set to delete and the cascade follows the five indexes
   * that already exist on `showtimeId`.
   */
  const cutoff = new Date(Date.now() - SPENT_SHOWTIME_RETENTION_MS);
  const spentShowtimesPurged = await prisma.$executeRaw`
    DELETE FROM "Showtime"
    WHERE id IN (
      SELECT t.id
      FROM "Showtime" t
      WHERE t."startsAt" < ${cutoff}
        AND NOT EXISTS (SELECT 1 FROM "Booking" b WHERE b."showtimeId" = t.id)
      ORDER BY t."startsAt"
      LIMIT ${SPENT_SHOWTIME_BATCH}
    )
  `;

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
    refreshTokensPurged,
    spentShowtimesPurged,
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
      // Logged on its own, because it is the line that says whether the
      // database is still growing. A deployment working through a backlog
      // prints it every tick until there is nothing left to remove.
      if (result.spentShowtimesPurged > 0) {
        logger.info(
          { spentShowtimesPurged: result.spentShowtimesPurged },
          'Sweeper removed screenings that have happened and were never booked',
        );
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
