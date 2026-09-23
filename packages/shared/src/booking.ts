import { z } from 'zod';
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
  totalMinor: z.number().int(),
  currency: z.string(),
  seats: z.array(heldSeatSchema),
  addOns: z.array(bookingAddOnSchema),
  showtime: z.object({
    id: z.string(),
    startsAt: z.string(),
    format: showFormatSchema,
    language: z.string(),
    movie: z.object({ id: z.string(), title: z.string(), posterUrl: z.string() }),
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
