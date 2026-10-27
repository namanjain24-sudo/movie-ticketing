import { z } from 'zod';
import { eventKindSchema } from './event';
import { seatTierSchema, showFormatSchema } from './catalog';

// ---------------------------------------------------------------------------
// Holds
// ---------------------------------------------------------------------------

export const createHoldSchema = z.object({
  /**
   * ShowSeat ids, as returned by the seat map. Bounded here as well as on the
   * server config, so an oversized request is rejected before it reaches the
   * database.
   */
  showSeatIds: z.array(z.string().min(1)).min(1).max(20),
});
export type CreateHoldInput = z.infer<typeof createHoldSchema>;

export const heldSeatSchema = z.object({
  showSeatId: z.string(),
  rowLabel: z.string(),
  number: z.number().int(),
  tier: seatTierSchema,
  /**
   * What the venue calls this seat's band, when it calls it something.
   *
   * Null for a film, where the band really is called Standard or Premium and
   * the tier already says so. Set for a ground, where it is the Garware
   * Pavilion or the North Stand — which is the part somebody actually needs
   * at the turnstile, and which a tier name cannot carry.
   */
  tierLabel: z.string().nullable().default(null),
  priceMinor: z.number().int(),
});
export type HeldSeat = z.infer<typeof heldSeatSchema>;

export const holdSchema = z.object({
  id: z.string(),
  showtimeId: z.string(),
  status: z.enum(['ACTIVE', 'RELEASED', 'EXPIRED', 'CONVERTED']),
  seats: z.array(heldSeatSchema),
  subtotalMinor: z.number().int(),
  feeMinor: z.number().int(),
  totalMinor: z.number().int(),
  currency: z.string(),
  /** Authoritative. The countdown is derived from this and `serverTime`. */
  expiresAt: z.string(),
  serverTime: z.string(),
});
export type Hold = z.infer<typeof holdSchema>;

/**
 * A hold the caller still owns, with enough of its showtime to name it.
 *
 * Exists because a hold is the one piece of state in this app that is losing
 * value while nobody is looking at it: five minutes, counted by the server,
 * and the seats go back on sale. If the app was closed mid-checkout — a call
 * came in, the phone slept, somebody switched away to check a date — there
 * was no way back to it except remembering the film and starting again.
 */
export const activeHoldSchema = z.object({
  hold: holdSchema,
  showtime: z.object({
    id: z.string(),
    startsAt: z.string(),
    /** Exactly one of these, the same rule the ticket follows. */
    movie: z
      .object({ id: z.string(), slug: z.string(), title: z.string(), posterUrl: z.string() })
      .nullable()
      .default(null),
    event: z
      .object({ id: z.string(), slug: z.string(), title: z.string(), posterUrl: z.string() })
      .nullable()
      .default(null),
    cinema: z.object({ id: z.string(), name: z.string(), city: z.string() }),
    screen: z.object({ id: z.string(), name: z.string() }),
  }),
});
export type ActiveHold = z.infer<typeof activeHoldSchema>;

/**
 * Body of a 409 when seats were taken between the map load and the tap. The
 * seat map uses `unavailableShowSeatIds` to grey those seats out in place.
 */
export const seatConflictSchema = z.object({
  unavailableShowSeatIds: z.array(z.string()),
});
export type SeatConflict = z.infer<typeof seatConflictSchema>;

// ---------------------------------------------------------------------------
// Concessions
// ---------------------------------------------------------------------------

export const concessionItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  priceMinor: z.number().int(),
  currency: z.string(),
});
export type ConcessionItem = z.infer<typeof concessionItemSchema>;

export const addOnLineSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().min(1).max(20),
});
export type AddOnLine = z.infer<typeof addOnLineSchema>;

/** A priced line item on a confirmed booking — the item plus what it cost. */
export const bookingAddOnSchema = z.object({
  itemId: z.string(),
  name: z.string(),
  quantity: z.number().int(),
  unitPriceMinor: z.number().int(),
});
export type BookingAddOn = z.infer<typeof bookingAddOnSchema>;

// ---------------------------------------------------------------------------
// Checkout and payment
// ---------------------------------------------------------------------------

export const checkoutSchema = z.object({
  holdId: z.string().min(1),
  /**
   * Test-mode instrument selector. A real integration would carry a gateway
   * token here instead; the shape is the same so the swap is local.
   */
  method: z.enum(['CARD', 'UPI', 'NETBANKING']).default('CARD'),
  /**
   * Priced once, when the booking is first created. A retry after a declined
   * payment reuses that booking and its price, so a code sent then is ignored.
   */
  promoCode: z.string().trim().min(1).max(32).optional(),
  /**
   * Concessions, priced against the live catalogue at checkout — not held
   * against inventory the way seats are, since popcorn has no scarcity to
   * protect. Priced once, same as the promo code: a retry reuses the booking.
   */
  addOns: z.array(addOnLineSchema).max(20).optional(),
  /**
   * Loyalty points to spend, on top of any promo code — priced once, same
   * rule as the code above.
   */
  pointsToRedeem: z.number().int().min(1).optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const PAYMENT_STATUSES = [
  'PENDING',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'REFUNDED',
] as const;
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const checkoutResultSchema = z.object({
  bookingId: z.string(),
  reference: z.string(),
  paymentId: z.string(),
  /** Gateway handle the client would hand to the provider SDK. */
  clientSecret: z.string(),
  status: paymentStatusSchema,
  amountMinor: z.number().int(),
  currency: z.string(),
  /** Mirrors the hold, so the countdown keeps running through checkout. */
  expiresAt: z.string(),
  serverTime: z.string(),
});
export type CheckoutResult = z.infer<typeof checkoutResultSchema>;

/**
 * Poll response for the ambiguous-payment case: the client submitted, the
 * network dropped, and it needs to learn the outcome without guessing.
 */
export const paymentStatusResultSchema = z.object({
  paymentId: z.string(),
  bookingId: z.string(),
  status: paymentStatusSchema,
  bookingStatus: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'FAILED']),
  failureReason: z.string().nullable(),
  /** Present once the booking is confirmed. */
  reference: z.string().nullable(),
});
export type PaymentStatusResult = z.infer<typeof paymentStatusResultSchema>;

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export const bookingSchema = z.object({
  id: z.string(),
  reference: z.string(),
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'FAILED']),
  createdAt: z.string(),
  confirmedAt: z.string().nullable(),
  subtotalMinor: z.number().int(),
  feeMinor: z.number().int(),
  addOnsMinor: z.number().int(),
  discountMinor: z.number().int(),
  /** The code that produced `discountMinor`, when one was used. */
  promoCode: z.string().nullable(),
  /** How many points were spent on this booking, already folded into `discountMinor`. */
  pointsRedeemed: z.number().int(),
  /** Earned on confirmation, at the rate `loyalty.service.ts` fixes. Zero until then. */
  pointsEarned: z.number().int(),
  totalMinor: z.number().int(),
  currency: z.string(),
  seats: z.array(heldSeatSchema),
  addOns: z.array(bookingAddOnSchema),
  showtime: z.object({
    id: z.string(),
    startsAt: z.string(),
    format: showFormatSchema,
    language: z.string(),
    /**
     * What the ticket is for. Exactly one of these, mirroring the row: a
     * ticket to a match has no film attached, and a blank one would be worse
     * than an absent one on the stub that gets scanned at the gate.
     */
    movie: z
      .object({ id: z.string(), title: z.string(), posterUrl: z.string() })
      .nullable()
      .default(null),
    event: z
      .object({
        id: z.string(),
        slug: z.string(),
        kind: eventKindSchema,
        title: z.string(),
        posterUrl: z.string(),
      })
      .nullable()
      .default(null),
    cinema: z.object({ id: z.string(), name: z.string(), city: z.string(), address: z.string() }),
    screen: z.object({ id: z.string(), name: z.string() }),
  }),
  /** Payload encoded into the ticket QR. Verifiable offline against the API. */
  qrPayload: z.string(),
});
export type Booking = z.infer<typeof bookingSchema>;

/**
 * What a cancellation gives back. The booking fee is retained, which is the
 * convention every Indian ticketing platform follows and the one thing users
 * most need stated plainly before they confirm.
 */
export const cancellationSchema = z.object({
  bookingId: z.string(),
  reference: z.string(),
  status: z.literal('CANCELLED'),
  /// Returned to the original payment method.
  refundMinor: z.number().int(),
  /// Kept. Equal to the booking fee charged at checkout.
  feeRetainedMinor: z.number().int(),
  currency: z.string(),
  cancelledAt: z.string(),
  /// Seats handed back to the map, so the client can update in place.
  releasedShowSeatIds: z.array(z.string()),
});
export type Cancellation = z.infer<typeof cancellationSchema>;

/** Quoted before the user commits, so the refund is never a surprise. */
export const cancellationQuoteSchema = z.object({
  cancellable: z.boolean(),
  refundMinor: z.number().int(),
  feeRetainedMinor: z.number().int(),
  currency: z.string(),
  /// Absolute instant after which cancellation is refused.
  deadline: z.string(),
  serverTime: z.string(),
  /// Present when `cancellable` is false: why not, in the user's terms.
  reason: z.string().nullable(),
});
export type CancellationQuote = z.infer<typeof cancellationQuoteSchema>;

export const bookingListSchema = z.object({
  upcoming: z.array(bookingSchema),
  past: z.array(bookingSchema),
});
export type BookingList = z.infer<typeof bookingListSchema>;

/** Formats minor units as a rupee string. Shared so app and dashboard agree. */
export function formatMoney(minor: number, currency = 'INR'): string {
  const major = minor / 100;
  const symbol = currency === 'INR' ? '₹' : '';
  return `${symbol}${major.toLocaleString('en-IN', {
    minimumFractionDigits: major % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

// ---------------------------------------------------------------------------
// Promo codes
// ---------------------------------------------------------------------------

export const PROMO_REASONS = [
  'NOT_FOUND',
  'INACTIVE',
  'NOT_STARTED',
  'EXPIRED',
  'MIN_SPEND',
  'USED_UP',
  'ALREADY_USED',
] as const;
export type PromoReason = (typeof PROMO_REASONS)[number];

export const promoValidateSchema = z.object({
  holdId: z.string().min(1),
  code: z.string().trim().min(1).max(32),
});
export type PromoValidateInput = z.infer<typeof promoValidateSchema>;

/** What the checkout screen shows once a code has been checked against a hold. */
export const promoQuoteSchema = z.object({
  code: z.string(),
  description: z.string(),
  subtotalMinor: z.number().int(),
  feeMinor: z.number().int(),
  discountMinor: z.number().int(),
  totalMinor: z.number().int(),
  currency: z.string(),
});
export type PromoQuote = z.infer<typeof promoQuoteSchema>;

/** A code the app can advertise. Only ones anybody could use right now. */
export const promoOfferSchema = z.object({
  code: z.string(),
  description: z.string(),
  minSubtotalMinor: z.number().int(),
  expiresAt: z.string().nullable(),
});
export type PromoOffer = z.infer<typeof promoOfferSchema>;

// ---------------------------------------------------------------------------
// Loyalty points
// ---------------------------------------------------------------------------

export const LOYALTY_REASONS = ['INSUFFICIENT_BALANCE', 'EXCEEDS_SUBTOTAL'] as const;
export type LoyaltyInvalidReason = (typeof LOYALTY_REASONS)[number];

/** 1 point = ₹1 off. Shared so the checkout screen can compute how many
 * points a hold could use without a round trip, and agree with the server
 * about what redeeming them is actually worth. */
export const POINT_VALUE_MINOR = 100;

export const loyaltyBalanceSchema = z.object({
  balance: z.number().int(),
  /**
   * Everything ever earned, which is what a tier is ranked on. Defaulted
   * rather than required: an app built against a server that predates this
   * field should show a Regular tier, not fail to parse its own balance.
   */
  lifetimePoints: z.number().int().min(0).default(0),
});
export type LoyaltyBalance = z.infer<typeof loyaltyBalanceSchema>;

export const loyaltyRedeemSchema = z.object({
  holdId: z.string().min(1),
  points: z.number().int().min(1),
});
export type LoyaltyRedeemInput = z.infer<typeof loyaltyRedeemSchema>;

/** What the checkout screen shows once a points spend has been checked against a hold. */
export const loyaltyQuoteSchema = z.object({
  points: z.number().int(),
  subtotalMinor: z.number().int(),
  feeMinor: z.number().int(),
  discountMinor: z.number().int(),
  totalMinor: z.number().int(),
  currency: z.string(),
});
export type LoyaltyQuote = z.infer<typeof loyaltyQuoteSchema>;

// ---------------------------------------------------------------------------
// Split pay
// ---------------------------------------------------------------------------

export const bookingSplitShareInputSchema = z.object({
  label: z.string().trim().min(1).max(60),
  amountMinor: z.number().int().min(1),
});
export type BookingSplitShareInput = z.infer<typeof bookingSplitShareInputSchema>;

/** Replaces the whole list at once — shares have no identity worth keeping
 * across an edit, since "who's in" is exactly what's being changed. */
export const setBookingSplitSchema = z.object({
  shares: z.array(bookingSplitShareInputSchema).min(1).max(20),
});
export type SetBookingSplitInput = z.infer<typeof setBookingSplitSchema>;

export const bookingSplitShareSchema = z.object({
  id: z.string(),
  label: z.string(),
  amountMinor: z.number().int(),
  settled: z.boolean(),
  position: z.number().int(),
});
export type BookingSplitShare = z.infer<typeof bookingSplitShareSchema>;

export const bookingSplitSchema = z.object({
  bookingId: z.string(),
  totalMinor: z.number().int(),
  currency: z.string(),
  shares: z.array(bookingSplitShareSchema),
});
export type BookingSplit = z.infer<typeof bookingSplitSchema>;

export const toggleBookingSplitShareSchema = z.object({
  settled: z.boolean(),
});
export type ToggleBookingSplitShareInput = z.infer<typeof toggleBookingSplitShareSchema>;

/**
 * Loyalty tiers.
 *
 * Ranked on **lifetime points earned**, never on the current balance. Spending
 * points is the thing the programme is for; a tier that fell when you used it
 * would be a programme that punishes you for taking part.
 *
 * `EARNED` entries count, and so do the negative `REVERSED` ones, which are
 * `clawbackEarned` undoing an award for a booking that was cancelled. The
 * positive `REVERSED` entries do not: those are `reverseRedemption` handing
 * back points that were spent on a booking that never completed, and handing
 * back a spend is not a fresh earning.
 *
 * **These tiers carry no perks, and the app says so.** Writing "free popcorn
 * at Gold" here takes one line and would be a lie until something enforces
 * it, and a lie on this screen is the same lie the support agent is built to
 * never tell. The obvious perk — a better earn rate — is deliberately not
 * taken: `earnedPoints` is pure in `totalMinor` so that `clawbackEarned` can
 * exactly undo an award, and a rate that varied with a tier the user may have
 * left by the time they cancel would break that on the money path. A real
 * perk belongs in a change that implements it, not in a label.
 */
export const LOYALTY_TIERS = [
  { id: 'REGULAR', name: 'Regular', minLifetimePoints: 0 },
  { id: 'SILVER', name: 'Silver', minLifetimePoints: 50 },
  { id: 'GOLD', name: 'Gold', minLifetimePoints: 150 },
  { id: 'PLATINUM', name: 'Platinum', minLifetimePoints: 400 },
] as const;

export type LoyaltyTierId = (typeof LOYALTY_TIERS)[number]['id'];
export type LoyaltyTier = (typeof LOYALTY_TIERS)[number];

/** The highest tier this many lifetime points reaches. Never null: `REGULAR` starts at zero. */
export function tierFor(lifetimePoints: number): LoyaltyTier {
  let reached: LoyaltyTier = LOYALTY_TIERS[0];
  for (const tier of LOYALTY_TIERS) {
    if (lifetimePoints >= tier.minLifetimePoints) reached = tier;
  }
  return reached;
}

/** The next tier up, or null at the top. */
export function nextTierAfter(lifetimePoints: number): LoyaltyTier | null {
  return LOYALTY_TIERS.find((t) => t.minLifetimePoints > lifetimePoints) ?? null;
}
