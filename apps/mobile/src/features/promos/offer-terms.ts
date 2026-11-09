import { formatMoney, type PromoOffer } from '@app/shared';

/**
 * The conditions on an offer, in the words the card should show.
 *
 * `minSubtotalMinor` and `expiresAt` arrive on every offer and were being
 * thrown away: the rail printed a code and a sentence, and the first anybody
 * heard about a minimum spend was checkout refusing the code. "Offers that do
 * not work at checkout" is one of the most common complaints made about apps
 * in this category, and here it was self-inflicted - the server had already
 * said why, and the screen did not pass it on.
 */

/** A week. Past that, an expiry is noise rather than a reason to hurry. */
const SOON_DAYS = 7;

export type OfferTerms = {
  /** "Min ₹500", or null when the offer has no floor. */
  minimum: string | null;
  /** "Ends today", "Ends in 3 days", or null when it is not close. */
  expiry: string | null;
  /** True once it has run out, so the card can stop offering it. */
  expired: boolean;
};

export function offerTerms(offer: PromoOffer, now: Date = new Date()): OfferTerms {
  const minimum = offer.minSubtotalMinor > 0 ? `Min ${formatMoney(offer.minSubtotalMinor)}` : null;

  if (!offer.expiresAt) return { minimum, expiry: null, expired: false };

  const endsAt = new Date(offer.expiresAt).getTime();
  if (Number.isNaN(endsAt)) return { minimum, expiry: null, expired: false };

  const msLeft = endsAt - now.getTime();
  if (msLeft <= 0) return { minimum, expiry: null, expired: true };

  // Whole days, rounded up: an offer with eight hours left "ends today", and
  // one with twenty-six hours left ends tomorrow rather than "in 1 day".
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  if (daysLeft > SOON_DAYS) return { minimum, expiry: null, expired: false };

  const expiry =
    daysLeft === 1 ? 'Ends today' : daysLeft === 2 ? 'Ends tomorrow' : `Ends in ${daysLeft} days`;
  return { minimum, expiry, expired: false };
}
