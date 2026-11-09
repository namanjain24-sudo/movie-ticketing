import { SCRATCH_PRIZES, type ScratchCard, type ScratchResult } from '@app/shared';
import { prisma, type Tx } from '../../db';
import { HttpError } from '../../http/errors';
import { dbNow, withTxRetry } from '../../lib/tx';
import { getBalance } from '../loyalty/loyalty.service';

/**
 * Scratch cards: one per confirmed booking, prize decided on issue.
 *
 * The prize is rolled and stored when the booking confirms, and scratching
 * only reveals it. That ordering is the whole design. If the client rolled,
 * the prize would be worth whatever the client said it was; if the server
 * rolled on reveal, a retried request would be a second chance at a better
 * number. Deciding once, server-side, before anybody is watching, is the only
 * version of this that is a lottery rather than a slot machine.
 *
 * Points land in `LoyaltyLedger` under `SCRATCHED`, which `balanceOf` sums
 * like every other row - so a win is genuinely spendable at checkout, through
 * the redemption path that already exists. `lifetimeEarnedOf` deliberately
 * does not count it: a tier is a record of what somebody spent, and luck is
 * not spending.
 */

const TOTAL_WEIGHT = SCRATCH_PRIZES.reduce((sum, prize) => sum + prize.weight, 0);

/**
 * Picks a prize by weight.
 *
 * `roll` is injectable so the distribution can be tested rather than trusted.
 * A lottery nobody can assert on is a lottery nobody can fix.
 */
export function pickPrize(roll: number = Math.random()): number {
  // Clamped, because `roll` crossing 1 would fall off the end of the table and
  // return the fallback, quietly making the rarest prize the common one.
  let remaining = Math.min(Math.max(roll, 0), 0.999999) * TOTAL_WEIGHT;
  for (const prize of SCRATCH_PRIZES) {
    remaining -= prize.weight;
    if (remaining < 0) return prize.points;
  }
  return SCRATCH_PRIZES[0].points;
}

/**
 * Mints the card for a booking that has just confirmed.
 *
 * `upsert` on the unique `bookingId` rather than a create: a webhook that
 * arrives twice must not mint a second card, and inside somebody else's
 * transaction a unique-violation would abort the confirmation itself. An
 * `update: {}` is a no-op on the second call, which is exactly the wanted
 * behaviour - the first roll stands.
 */
export async function issueForBooking(
  tx: Tx,
  params: { userId: string; bookingId: string },
): Promise<void> {
  await tx.scratchCard.upsert({
    where: { bookingId: params.bookingId },
    create: { userId: params.userId, bookingId: params.bookingId, points: pickPrize() },
    update: {},
  });
}

type CardRow = {
  id: string;
  points: number;
  scratchedAt: Date | null;
  createdAt: Date;
  booking: { reference: string };
};

/** Hides the prize until it has been revealed. See `scratchCardSchema`. */
function toWire(card: CardRow): ScratchCard {
  return {
    id: card.id,
    bookingReference: card.booking.reference,
    points: card.scratchedAt ? card.points : null,
    scratchedAt: card.scratchedAt?.toISOString() ?? null,
    createdAt: card.createdAt.toISOString(),
  };
}

const CARD_SELECT = {
  id: true,
  points: true,
  scratchedAt: true,
  createdAt: true,
  booking: { select: { reference: true } },
} as const;

/** Unscratched first, then newest. The one with something to find comes first. */
export async function listCards(userId: string): Promise<ScratchCard[]> {
  const rows = await prisma.scratchCard.findMany({ where: { userId }, select: CARD_SELECT });
  return rows
    .sort((a, b) => {
      const unscratched = Number(Boolean(a.scratchedAt)) - Number(Boolean(b.scratchedAt));
      if (unscratched !== 0) return unscratched;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .map(toWire);
}

export async function scratchCard(userId: string, cardId: string): Promise<ScratchResult> {
  const card = await withTxRetry(
    async (tx) => {
      // The row lock is what makes a double tap safe: two requests for the
      // same card serialise here, and the second one sees `scratchedAt` set.
      const locked = await tx.$queryRaw<
        { id: string; userId: string; points: number; scratchedAt: Date | null }[]
      >`
        SELECT id, "userId", points, "scratchedAt"
        FROM "ScratchCard"
        WHERE id = ${cardId}
        FOR UPDATE
      `;

      const row = locked[0];
      // Somebody else's card is reported as missing rather than as forbidden.
      // "Forbidden" confirms it exists, which is a thing the owner of a
      // reward id is not entitled to learn.
      if (!row || row.userId !== userId) {
        throw HttpError.notFound('That reward does not exist');
      }

      // Already revealed. Answering with it rather than refusing means a
      // retried request, or a second tap on a slow connection, shows the same
      // prize instead of an error about a card the user has already won.
      if (row.scratchedAt) {
        return tx.scratchCard.findUniqueOrThrow({ where: { id: cardId }, select: CARD_SELECT });
      }

      const now = await dbNow(tx);
      await tx.scratchCard.update({ where: { id: cardId }, data: { scratchedAt: now } });
      // Same transaction as the reveal, so a card cannot be marked scratched
      // without being paid, or paid without being marked.
      await tx.loyaltyLedger.create({
        data: { userId, points: row.points, reason: 'SCRATCHED' },
      });

      return tx.scratchCard.findUniqueOrThrow({ where: { id: cardId }, select: CARD_SELECT });
    },
    { label: 'scratchCard' },
  );

  // Read after the commit rather than inside it. The balance is a sum over the
  // whole ledger, and the number worth showing is the one that is true now,
  // not the one that was true mid-transaction.
  const { balance } = await getBalance(userId);
  return { card: toWire(card), balance };
}
