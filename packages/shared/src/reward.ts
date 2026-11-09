import { z } from 'zod';

/**
 * A scratch card, as the client is allowed to see it.
 *
 * `points` is null until the card has been scratched, and that is a rule about
 * the API rather than about the database. The prize is decided and stored at
 * issuance, so it exists on the server from the moment the booking confirms -
 * and if the list endpoint returned it, anybody could read the prize out of
 * the response before the animation ran. The reveal has to come from the
 * reveal.
 */
export const scratchCardSchema = z.object({
  id: z.string(),
  /** The booking this came with, so the UI can say what earned it. */
  bookingReference: z.string(),
  /** The prize. Null while unscratched, and never null once `scratchedAt` is set. */
  points: z.number().int().positive().nullable(),
  scratchedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ScratchCard = z.infer<typeof scratchCardSchema>;

export const scratchCardListSchema = z.object({
  cards: z.array(scratchCardSchema),
});
export type ScratchCardList = z.infer<typeof scratchCardListSchema>;

/**
 * What a reveal answers with: the card, now scratched, and the balance it
 * produced.
 *
 * The balance travels back so the screen that just awarded points does not
 * have to refetch to show them, and so the two numbers cannot disagree on the
 * frame right after a win.
 */
export const scratchResultSchema = z.object({
  card: scratchCardSchema,
  balance: z.number().int().nonnegative(),
});
export type ScratchResult = z.infer<typeof scratchResultSchema>;

/**
 * The prize table, shared so the app can say what is possible without
 * guessing and the server has exactly one list to draw from.
 *
 * Points are worth a rupee each and a booking earns one per hundred spent, so
 * a typical ticket earns about five. These are a multiple of that rather than
 * a different currency: enough that winning is worth the tap, not so much that
 * the programme stops meaning anything.
 *
 * `weight` is relative, not a percentage, so adding a prize does not require
 * rebalancing every other line.
 */
export const SCRATCH_PRIZES = [
  { points: 10, weight: 50 },
  { points: 25, weight: 30 },
  { points: 50, weight: 15 },
  { points: 100, weight: 5 },
] as const;
