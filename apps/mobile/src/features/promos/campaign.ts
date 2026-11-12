/**
 * The line a campaign leads with.
 *
 * An offer arrives from the server as a code and a sentence of terms —
 * "WELCOME50", "₹50 off your booking. Minimum ₹200 on seats." That is
 * accurate and it is not a campaign; nobody reads a minimum-spend clause and
 * feels invited. The slogan says the same thing in the register an offer is
 * normally said in, and the terms stay underneath it, unchanged and in full.
 *
 * Written here rather than sent, because copy is written by a person. The
 * server owns what the offer *is* — the discount, the minimum, the expiry —
 * and this owns only how it is announced. The two can never disagree about
 * money, because only one of them states any.
 *
 * A code with no line written for it gets none, and the card falls back to
 * leading with its terms. That is the honest default: a slogan invented for
 * an offer nobody has read would be the one line on the screen that was not
 * checked against what it actually gives you.
 */
const SLOGANS: Record<string, string> = {
  WELCOME50: 'First one’s on us.',
  MOVIE20: 'A fifth off the seats.',
  FAMILY100: 'Bring the whole row.',
};

export function campaignSlogan(code: string): string | null {
  return SLOGANS[code.trim().toUpperCase()] ?? null;
}
