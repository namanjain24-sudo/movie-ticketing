import type { HeldSeat, Hold as HoldDto, SeatDelta } from '@app/shared';
import type { SeatTier } from '@prisma/client';
import { prisma, type Tx } from '../../db';
import { env } from '../../env';
import { HttpError } from '../../http/errors';
import { dbNow, isLockTimeout, setLockTimeout, withTxRetry } from '../../lib/tx';
import { publishSeatDeltas } from '../realtime/seat-events';

/**
 * The hold is the only place in the system where seat inventory is claimed,
 * and it is the only place that needs to be right for the "never oversells"
 * claim to hold. Two properties do the work:
 *
 *   1. `SELECT ... FOR UPDATE` inside a transaction. The row lock is the whole
 *      mechanism. A second transaction asking for the same seat blocks until
 *      the first commits, then re-evaluates the `state` predicate and finds
 *      the seat gone. There is no window between the check and the write,
 *      because the check *is* the lock.
 *
 *   2. All-or-nothing. If the locked set is smaller than the requested set,
 *      the transaction rolls back and nobody gets a partial hold. Partial
 *      holds would strand seats that no user believes they own.
 *
 * Everything else about the hold, including expiry, is arranged so that no
 * background job is ever load-bearing.
 */

/** Row shape returned by the locking query. */
interface LockedSeatRow {
  id: string;
  priceMinor: number;
  rowLabel: string;
  number: number;
  tier: SeatTier;
}

export interface CreateHoldParams {
  userId: string;
  showtimeId: string;
  showSeatIds: string[];
}

export async function createHold(params: CreateHoldParams): Promise<HoldDto> {
  const { userId, showtimeId } = params;

  // De-duplicate before anything else: the same seat listed twice would make
  // the requested count disagree with the locked count and read as a phantom
  // conflict.
  const showSeatIds = [...new Set(params.showSeatIds)];

  if (showSeatIds.length > env.MAX_SEATS_PER_BOOKING) {
    throw HttpError.tooManySeats(env.MAX_SEATS_PER_BOOKING);
  }

  const result = await withTxRetry(
    async (tx) => {
      await setLockTimeout(tx);
      const now = await dbNow(tx);

      const showtime = await tx.showtime.findUnique({
        where: { id: showtimeId },
        select: { id: true, currency: true, salesCloseAt: true },
      });
      if (!showtime) throw HttpError.notFound('That showtime does not exist');
      if (showtime.salesCloseAt <= now) throw HttpError.salesClosed();

      // The critical section.
      //
      // `FOR UPDATE OF ss` locks only the inventory rows, not the joined seat
      // catalogue, so two bookings in the same auditorium never contend on the
      // physical seat record.
      //
      // The `holdExpiresAt <= now()` arm is what makes expiry immediate: a
      // seat whose hold has run out is treated as free by this query, with no
      // sweeper involvement at all.
      //
      // `ORDER BY ss.id` makes concurrent requests take their locks in the
      // same order, which removes almost all deadlocks. The ones that survive
      // are handled by the retry in `withTxRetry`, not by hoping.
      const locked = await tx.$queryRaw<LockedSeatRow[]>`
        SELECT ss.id, ss."priceMinor", s."rowLabel", s."number", s."tier"
        FROM "ShowSeat" ss
        JOIN "Seat" s ON s.id = ss."seatId"
        WHERE ss."showtimeId" = ${showtimeId}
          AND ss.id = ANY(${showSeatIds}::text[])
          AND (
            ss.state = 'AVAILABLE'
            OR (ss.state = 'HELD' AND ss."holdExpiresAt" <= now())
          )
        ORDER BY ss.id
        FOR UPDATE OF ss
      `.catch((err: unknown) => {
        // Waiting out the lock timeout means a queue of other users is ahead
        // of us on these exact seats. By the time it cleared they would be
        // gone anyway, so this is a conflict, not a server fault.
        if (isLockTimeout(err)) throw HttpError.seatsContended();
        throw err;
      });

      if (locked.length !== showSeatIds.length) {
        // Only now is it worth a second query, and only to tell "taken" apart
        // from "not a seat in this show".
        throw await describeConflict(tx, showtimeId, showSeatIds, locked);
      }

      const subtotalMinor = locked.reduce((sum, seat) => sum + seat.priceMinor, 0);
      const expiresAt = new Date(now.getTime() + env.HOLD_TTL_SECONDS * 1000);

      const hold = await tx.hold.create({
        data: {
          showtimeId,
          userId,
          status: 'ACTIVE',
          expiresAt,
          seatCount: locked.length,
          subtotalMinor,
        },
        select: { id: true, status: true, expiresAt: true },
      });

      // Safe without a further predicate: these rows are locked by this
      // transaction and cannot have changed since the SELECT.
      await tx.showSeat.updateMany({
        where: { id: { in: showSeatIds } },
        data: {
          state: 'HELD',
          holdId: hold.id,
          holdExpiresAt: expiresAt,
          // A re-hold of an expired seat must not inherit the previous
          // booking's link.
          bookingId: null,
        },
      });

      return {
        dto: toHoldDto({
          hold: { id: hold.id, showtimeId, status: 'ACTIVE', expiresAt },
          seats: locked,
          currency: showtime.currency,
          now,
        }),
        deltas: locked.map<SeatDelta>((s) => ({ showSeatId: s.id, status: 'UNAVAILABLE' })),
      };
    },
    { label: 'createHold' },
  );

  // After the commit, never inside it.
  await publishSeatDeltas(showtimeId, result.deltas);
  return result.dto;
}

/**
 * Turns a short lock result into the right error. Separated out because it
 * runs only on the conflict path and should cost nothing on the happy path.
 */
async function describeConflict(
  tx: Tx,
  showtimeId: string,
  requestedIds: string[],
  locked: LockedSeatRow[],
): Promise<HttpError> {
  const lockedIds = new Set(locked.map((s) => s.id));
  const missing = requestedIds.filter((id) => !lockedIds.has(id));

  const existing = await tx.showSeat.findMany({
    where: { id: { in: missing }, showtimeId },
    select: { id: true },
  });
  if (existing.length !== missing.length) {
    return HttpError.notFound('Some of those seats are not part of this showtime');
  }
  return HttpError.seatUnavailable(missing);
}

export async function getHold(params: { userId: string; holdId: string }): Promise<HoldDto> {
  const { userId, holdId } = params;

  const now = await dbNow(prisma);

  const hold = await prisma.hold.findUnique({
    where: { id: holdId },
    select: {
      id: true,
      userId: true,
      showtimeId: true,
      status: true,
      expiresAt: true,
      showtime: { select: { currency: true } },
      showSeats: {
        select: {
          id: true,
          priceMinor: true,
          seat: { select: { rowLabel: true, number: true, tier: true } },
        },
        orderBy: { id: 'asc' },
      },
    },
  });

  if (!hold) throw HttpError.notFound('That hold does not exist');
  // 404 rather than 403: one user should not be able to probe whether another
  // user's hold id is real.
  if (hold.userId !== userId) throw HttpError.notFound('That hold does not exist');

  return toHoldDto({
    hold: {
      id: hold.id,
      showtimeId: hold.showtimeId,
      // Logical expiry again: an ACTIVE row past its deadline is reported as
      // EXPIRED even though no job has touched it yet.
      status: hold.status === 'ACTIVE' && hold.expiresAt <= now ? 'EXPIRED' : hold.status,
      expiresAt: hold.expiresAt,
    },
    seats: hold.showSeats.map((ss) => ({
      id: ss.id,
      priceMinor: ss.priceMinor,
      rowLabel: ss.seat.rowLabel,
      number: ss.seat.number,
      tier: ss.seat.tier,
    })),
    currency: hold.showtime.currency,
    now,
  });
}

/**
 * Voluntary release, used when the user backs out of checkout. Returns the
 * seats immediately rather than making the next user wait out the TTL.
 */
export async function releaseHold(params: { userId: string; holdId: string }): Promise<void> {
  const { userId, holdId } = params;

  const released = await withTxRetry(
    async (tx) => {
      const hold = await tx.hold.findUnique({
        where: { id: holdId },
        select: { id: true, userId: true, status: true, showtimeId: true },
      });
      if (!hold || hold.userId !== userId) throw HttpError.notFound('That hold does not exist');

      // Releasing an already-released or already-converted hold is a no-op,
      // not an error. Clients retry this on unmount and on back-navigation.
      if (hold.status !== 'ACTIVE') return { showtimeId: hold.showtimeId, deltas: [] };

      // Lock before mutating, for the same reason the hold path does: a
      // checkout for this hold may be running right now.
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "ShowSeat"
        WHERE "holdId" = ${holdId} AND state = 'HELD'
        ORDER BY id
        FOR UPDATE
      `;

      await tx.showSeat.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { state: 'AVAILABLE', holdId: null, holdExpiresAt: null },
      });
      await tx.hold.update({
        where: { id: holdId },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });

      return {
        showtimeId: hold.showtimeId,
        deltas: rows.map<SeatDelta>((r) => ({ showSeatId: r.id, status: 'AVAILABLE' })),
      };
    },
    { label: 'releaseHold' },
  );

  await publishSeatDeltas(released.showtimeId, released.deltas);
}

/**
 * Loads a hold inside an existing transaction with its seats locked, ready to
 * be converted into a booking. Used only by the checkout path.
 *
 * Throws `holdExpired` rather than returning a flag, because every caller has
 * the same correct response to an expired hold and forgetting the check would
 * be a way to confirm seats the user no longer owns.
 */
export async function lockActiveHold(
  tx: Tx,
  params: { holdId: string; userId: string },
): Promise<{
  showtimeId: string;
  currency: string;
  expiresAt: Date;
  seats: LockedSeatRow[];
  subtotalMinor: number;
}> {
  const now = await dbNow(tx);

  const hold = await tx.hold.findUnique({
    where: { id: params.holdId },
    select: {
      id: true,
      userId: true,
      status: true,
      expiresAt: true,
      showtimeId: true,
      subtotalMinor: true,
      showtime: { select: { currency: true, salesCloseAt: true } },
    },
  });

  if (!hold || hold.userId !== params.userId) {
    throw HttpError.notFound('That hold does not exist');
  }
  if (hold.status === 'CONVERTED') {
    throw HttpError.conflict('That hold has already been checked out');
  }
  if (hold.status !== 'ACTIVE' || hold.expiresAt <= now) {
    throw HttpError.holdExpired();
  }
  if (hold.showtime.salesCloseAt <= now) throw HttpError.salesClosed();

  // Lock the seats and re-assert they still belong to this hold. Between the
  // read above and this lock, the sweeper could have expired the hold; the
  // predicate catches that rather than trusting the earlier read.
  const seats = await tx.$queryRaw<LockedSeatRow[]>`
    SELECT ss.id, ss."priceMinor", s."rowLabel", s."number", s."tier"
    FROM "ShowSeat" ss
    JOIN "Seat" s ON s.id = ss."seatId"
    WHERE ss."holdId" = ${params.holdId}
      AND ss.state = 'HELD'
      AND ss."holdExpiresAt" > now()
    ORDER BY ss.id
    FOR UPDATE OF ss
  `;

  if (seats.length === 0) throw HttpError.holdExpired();

  return {
    showtimeId: hold.showtimeId,
    currency: hold.showtime.currency,
    expiresAt: hold.expiresAt,
    seats,
    subtotalMinor: hold.subtotalMinor,
  };
}

// ---------------------------------------------------------------------------

export function bookingFeeMinor(): number {
  return env.BOOKING_FEE_MINOR;
}

export function toHeldSeats(seats: LockedSeatRow[]): HeldSeat[] {
  return seats.map((s) => ({
    showSeatId: s.id,
    rowLabel: s.rowLabel,
    number: s.number,
    tier: s.tier,
    priceMinor: s.priceMinor,
  }));
}

function toHoldDto(input: {
  hold: { id: string; showtimeId: string; status: HoldDto['status']; expiresAt: Date };
  seats: LockedSeatRow[];
  currency: string;
  now: Date;
}): HoldDto {
  const subtotalMinor = input.seats.reduce((sum, s) => sum + s.priceMinor, 0);
  const feeMinor = bookingFeeMinor();
  return {
    id: input.hold.id,
    showtimeId: input.hold.showtimeId,
    status: input.hold.status,
    seats: toHeldSeats(input.seats),
    subtotalMinor,
    feeMinor,
    totalMinor: subtotalMinor + feeMinor,
    currency: input.currency,
    expiresAt: input.hold.expiresAt.toISOString(),
    serverTime: input.now.toISOString(),
  };
}
