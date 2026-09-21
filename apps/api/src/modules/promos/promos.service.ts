import type { PromoOffer, PromoQuote } from '@app/shared';
import type { PromoCode } from '@prisma/client';
import { prisma, type Tx } from '../../db';
import { HttpError } from '../../http/errors';
import { dbNow } from '../../lib/tx';
import { bookingFeeMinor } from '../holds/holds.service';

/**
 * The discount a code gives on a given seat subtotal.
 *
 * Applied to seats only, never to the booking fee. The fee is the cinema's cost
 * of taking the booking, and letting a code erase it would make every refund
 * calculation ("fee retained") a special case.
 *
 * Two ceilings keep the arithmetic safe whatever a promo row says: a discount
 * can never exceed the seat subtotal, and the customer always owes at least one
 * minor unit, because a zero-value charge is something no payment gateway
 * accepts and a booking that cannot be paid is worse than one that costs a paisa.
 */
export function computeDiscount(
  promo: Pick<PromoCode, 'kind' | 'value' | 'maxDiscountMinor'>,
  subtotalMinor: number,
  feeMinor: number,
): number {
  const raw =
    promo.kind === 'PERCENT' ? Math.floor((subtotalMinor * promo.value) / 100) : promo.value;
  const capped = promo.maxDiscountMinor === null ? raw : Math.min(raw, promo.maxDiscountMinor);
  return Math.max(0, Math.min(capped, subtotalMinor, subtotalMinor + feeMinor - 1));
}

/** What a customer actually gets back on cancellation: seats paid, minus the discount. */
export function refundableMinor(booking: { subtotalMinor: number; discountMinor: number }): number {
  return Math.max(0, booking.subtotalMinor - booking.discountMinor);
}

/** Codes are typed on a phone: case and stray spaces are not the user's mistake. */
export function normaliseCode(code: string): string {
  return code.trim().toUpperCase();
}

type Db = Pick<Tx, '$queryRaw' | 'promoCode'>;

/**
 * Bookings that currently hold a redemption. A confirmed booking always does; a
 * pending one does only while its hold is still alive. An abandoned checkout
 * must give its use back when the hold lapses, without any job having to say so.
 */
async function liveRedemptions(
  db: Db,
  promoId: string,
  now: Date,
  userId?: string,
): Promise<number> {
  const rows = await db.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n
    FROM "Booking" b
    JOIN "Hold" h ON h.id = b."holdId"
    WHERE b."promoCodeId" = ${promoId}
      AND (${userId ?? null}::text IS NULL OR b."userId" = ${userId ?? null})
      AND (
        b.status = 'CONFIRMED'
        OR (b.status = 'PENDING' AND h.status = 'ACTIVE' AND h."expiresAt" > ${now})
      )
  `;
  return Number(rows[0]?.n ?? 0);
}

export interface AppliedPromo {
  promo: PromoCode;
  discountMinor: number;
}

/**
 * Decides whether `code` may be used by this user on this subtotal, and for how
 * much. Every refusal carries a reason the app can put in front of a person.
 *
 * With `lock`, the promo row is held `FOR UPDATE` for the rest of the
 * transaction. Redemptions of one code are then serialised, so two people
 * racing for the last use — or one person opening two checkouts — cannot both
 * be told yes. Without it (a preview) the answer is advisory, and the locked
 * check at checkout has the final word.
 */
export async function evaluatePromo(
  db: Db,
  params: {
    code: string;
    userId: string;
    subtotalMinor: number;
    feeMinor: number;
    lock: boolean;
  },
): Promise<AppliedPromo> {
  const now = await dbNow(db);
  const code = normaliseCode(params.code);

  const found = await db.promoCode.findUnique({ where: { code } });
  if (!found) throw HttpError.promoInvalid('NOT_FOUND', 'That code does not exist');

  if (params.lock) {
    await db.$queryRaw`SELECT id FROM "PromoCode" WHERE id = ${found.id} FOR UPDATE`;
  }
  // Re-read under the lock: an admin edit between the two must not be missed.
  const promo = params.lock
    ? await db.promoCode.findUniqueOrThrow({ where: { id: found.id } })
    : found;

  if (!promo.active) throw HttpError.promoInvalid('INACTIVE', 'That code is no longer active');
  if (promo.startsAt && promo.startsAt > now) {
    throw HttpError.promoInvalid('NOT_STARTED', 'That code is not valid yet');
  }
  if (promo.expiresAt && promo.expiresAt <= now) {
    throw HttpError.promoInvalid('EXPIRED', 'That code has expired');
  }
  if (params.subtotalMinor < promo.minSubtotalMinor) {
    throw HttpError.promoInvalid(
      'MIN_SPEND',
      `Spend at least ₹${Math.ceil(promo.minSubtotalMinor / 100)} on seats to use this code`,
    );
  }
  if (promo.usageLimit !== null && (await liveRedemptions(db, promo.id, now)) >= promo.usageLimit) {
    throw HttpError.promoInvalid('USED_UP', 'That code has been fully redeemed');
  }
  if ((await liveRedemptions(db, promo.id, now, params.userId)) >= promo.perUserLimit) {
    throw HttpError.promoInvalid('ALREADY_USED', 'You have already used that code');
  }

  return {
    promo,
    discountMinor: computeDiscount(promo, params.subtotalMinor, params.feeMinor),
  };
}

/** Prices a code against a live hold, so the checkout screen can show the saving before payment. */
export async function quotePromo(params: {
  userId: string;
  holdId: string;
  code: string;
}): Promise<PromoQuote> {
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
  const { promo, discountMinor } = await evaluatePromo(prisma, {
    code: params.code,
    userId: params.userId,
    subtotalMinor: hold.subtotalMinor,
    feeMinor,
    lock: false,
  });

  return {
    code: promo.code,
    description: promo.description,
    subtotalMinor: hold.subtotalMinor,
    feeMinor,
    discountMinor,
    totalMinor: hold.subtotalMinor + feeMinor - discountMinor,
    currency: hold.showtime.currency,
  };
}

/** Codes anyone could use right now, for the offers list. */
export async function listOffers(): Promise<PromoOffer[]> {
  const now = await dbNow(prisma);
  const promos = await prisma.promoCode.findMany({
    where: {
      active: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
    },
    orderBy: { createdAt: 'asc' },
  });

  const offers: PromoOffer[] = [];
  for (const promo of promos) {
    // A fully redeemed code is not an offer, however active its flag says.
    if (
      promo.usageLimit !== null &&
      (await liveRedemptions(prisma, promo.id, now)) >= promo.usageLimit
    ) {
      continue;
    }
    offers.push({
      code: promo.code,
      description: promo.description,
      minSubtotalMinor: promo.minSubtotalMinor,
      expiresAt: promo.expiresAt?.toISOString() ?? null,
    });
  }
  return offers;
}
