import { POINT_VALUE_MINOR, type LoyaltyBalance, type LoyaltyQuote } from '@app/shared';
import { prisma, type Tx } from '../../db';
import { HttpError } from '../../http/errors';
import { dbNow } from '../../lib/tx';
import { bookingFeeMinor } from '../holds/holds.service';

/** 1 point per ₹100 spent. */
const EARN_RATE_MINOR_PER_POINT = 10_000;

type Db = Pick<Tx, '$queryRaw' | '$executeRaw' | 'loyaltyLedger'>;

/**
 * How many points a booking of this total earns. Pure and derived from
 * `totalMinor` alone, so a booking's `pointsEarned` can be shown — identically
 * before and after confirmation — without a column that could drift from it.
 */
export function earnedPoints(totalMinor: number): number {
  return Math.floor(totalMinor / EARN_RATE_MINOR_PER_POINT);
}

/**
 * The discount a points spend buys, capped the same two ways a promo code's
 * discount is in `promos.service.ts`: never more than the seat subtotal, and
 * never down to a zero charge.
 */
export function computeRedemptionDiscount(
  points: number,
  subtotalMinor: number,
  feeMinor: number,
): number {
  const raw = points * POINT_VALUE_MINOR;
  return Math.max(0, Math.min(raw, subtotalMinor, subtotalMinor + feeMinor - 1));
}

/**
 * Summed from the ledger, not stored — the same reasoning promo redemptions
 * are counted live from bookings rather than a counter column: nothing here
 * can drift from what the ledger actually says happened.
 */
async function balanceOf(db: Pick<Db, '$queryRaw'>, userId: string): Promise<number> {
  const rows = await db.$queryRaw<{ sum: bigint | null }[]>`
    SELECT COALESCE(SUM(points), 0)::bigint AS sum FROM "LoyaltyLedger" WHERE "userId" = ${userId}
  `;
  return Number(rows[0]?.sum ?? 0);
}

/**
 * Everything this user has ever earned, which is what their tier is ranked on
 * — not the balance, because spending points is what the programme is for and
 * a tier that fell when you used it would punish taking part.
 *
 * `EARNED` counts. So do the negative `REVERSED` rows, which are
 * `clawbackEarned` undoing an award for a booking that was cancelled. The
 * positive `REVERSED` rows do not: those are `reverseRedemption` returning
 * points that were spent on a booking that never completed, and giving back a
 * spend is not a fresh earning. Summing `REVERSED` blind would count those
 * twice and hand out tiers nobody reached.
 */
async function lifetimeEarnedOf(db: Pick<Db, '$queryRaw'>, userId: string): Promise<number> {
  const rows = await db.$queryRaw<{ sum: bigint | null }[]>`
    SELECT COALESCE(SUM(points), 0)::bigint AS sum
    FROM "LoyaltyLedger"
    WHERE "userId" = ${userId}
      AND (reason = 'EARNED' OR (reason = 'REVERSED' AND points < 0))
  `;
  return Math.max(0, Number(rows[0]?.sum ?? 0));
}

export async function getBalance(userId: string): Promise<LoyaltyBalance> {
  const [balance, lifetimePoints] = await Promise.all([
    balanceOf(prisma, userId),
    lifetimeEarnedOf(prisma, userId),
  ]);
  return { balance, lifetimePoints };
}

export interface AppliedLoyalty {
  points: number;
  discountMinor: number;
}

/**
 * Decides whether `points` may be spent by this user on this subtotal.
 *
 * With `lock`, a Postgres advisory lock on the user id serialises concurrent
 * redemptions for the rest of the transaction — there is no single row to
 * `SELECT ... FOR UPDATE` the way a promo code has, since the balance is a sum
 * over the whole ledger rather than a row of its own. Without it (a preview)
 * the answer is advisory, and the locked check at checkout has the final word.
 */
export async function evaluateRedemption(
  db: Db,
  params: {
    userId: string;
    points: number;
    subtotalMinor: number;
    feeMinor: number;
    lock: boolean;
  },
): Promise<AppliedLoyalty> {
  if (params.lock) {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.userId}))`;
  }

  const balance = await balanceOf(db, params.userId);
  if (params.points > balance) {
    throw HttpError.loyaltyInvalid(
      'INSUFFICIENT_BALANCE',
      `You only have ${balance} point${balance === 1 ? '' : 's'}`,
    );
  }
  // Checked before capping, not after: capping silently would mean the points
  // actually spent no longer matches `params.points`, and a redemption this
  // generous for the seats on offer is the user's mistake to correct, not the
  // server's to round away.
  if (params.points * POINT_VALUE_MINOR > params.subtotalMinor) {
    throw HttpError.loyaltyInvalid(
      'EXCEEDS_SUBTOTAL',
      `${params.points} points would discount more than these seats cost`,
    );
  }

  const discountMinor = computeRedemptionDiscount(
    params.points,
    params.subtotalMinor,
    params.feeMinor,
  );
  return { points: params.points, discountMinor };
}

/** Prices a points spend against a live hold, so checkout can show the saving before payment. */
export async function quoteRedemption(params: {
  userId: string;
  holdId: string;
  points: number;
}): Promise<LoyaltyQuote> {
  const now = await dbNow(prisma);
  const hold = await prisma.hold.findUnique({
    where: { id: params.holdId },
    select: {
      userId: true,
      status: true,
      expiresAt: true,
      subtotalMinor: true,
      showtime: { select: { currency: true } },
    },
  });
  if (!hold || hold.userId !== params.userId) throw HttpError.notFound('That hold does not exist');
  if (hold.status !== 'ACTIVE' || hold.expiresAt <= now) throw HttpError.holdExpired();

  const feeMinor = bookingFeeMinor();
  const { points, discountMinor } = await evaluateRedemption(prisma, {
    userId: params.userId,
    points: params.points,
    subtotalMinor: hold.subtotalMinor,
    feeMinor,
    lock: false,
  });

  return {
    points,
    subtotalMinor: hold.subtotalMinor,
    feeMinor,
    discountMinor,
    totalMinor: hold.subtotalMinor + feeMinor - discountMinor,
    currency: hold.showtime.currency,
  };
}

/** Logged at booking creation, inside the same transaction `evaluateRedemption`
 * locked in — "live" the moment a PENDING booking exists, same as a promo
 * redemption, and reversible by `reverseRedemption` if that booking never completes. */
export async function recordRedemption(
  tx: Tx,
  params: { userId: string; bookingId: string; points: number },
): Promise<void> {
  if (params.points <= 0) return;
  await tx.loyaltyLedger.create({
    data: {
      userId: params.userId,
      bookingId: params.bookingId,
      points: -params.points,
      reason: 'REDEEMED',
    },
  });
}

/** Hands spent points back when the booking that spent them fails or is
 * cancelled, so a dead booking never permanently costs real points. */
export async function reverseRedemption(
  tx: Tx,
  params: { userId: string; bookingId: string; points: number },
): Promise<void> {
  if (params.points <= 0) return;
  await tx.loyaltyLedger.create({
    data: {
      userId: params.userId,
      bookingId: params.bookingId,
      points: params.points,
      reason: 'REVERSED',
    },
  });
}

/** Awarded once a booking is confirmed — the only place a booking earns points. */
export async function awardPoints(
  tx: Tx,
  params: { userId: string; bookingId: string; totalMinor: number },
): Promise<void> {
  const points = earnedPoints(params.totalMinor);
  if (points <= 0) return;
  await tx.loyaltyLedger.create({
    data: { userId: params.userId, bookingId: params.bookingId, points, reason: 'EARNED' },
  });
}

/**
 * Claws back whatever `awardPoints` gave for this booking, when it is later
 * cancelled — the same "not live anymore" treatment `liveRedemptions` already
 * gives a cancelled booking's promo use in `promos.service.ts`. Computed from
 * the same pure `earnedPoints`, so it exactly undoes the original award.
 */
export async function clawbackEarned(
  tx: Tx,
  params: { userId: string; bookingId: string; totalMinor: number },
): Promise<void> {
  const points = earnedPoints(params.totalMinor);
  if (points <= 0) return;
  await tx.loyaltyLedger.create({
    data: {
      userId: params.userId,
      bookingId: params.bookingId,
      points: -points,
      reason: 'REVERSED',
    },
  });
}
