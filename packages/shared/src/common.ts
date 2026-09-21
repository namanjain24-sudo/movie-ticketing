import { z } from 'zod';

/** Every non-2xx response from the API has exactly this shape. */
export const apiErrorSchema = z.object({
  error: z.object({
    /** Stable machine-readable code. Clients switch on this, never on `message`. */
    code: z.string(),
    /** Human-readable text. Safe to show in a toast, but not localised. */
    message: z.string(),
    /** Field-level validation problems, keyed by dotted field path. */
    details: z.record(z.string(), z.array(z.string())).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',

  // --- Booking mechanic ------------------------------------------------------
  /// At least one requested seat was taken between the map load and the tap.
  /// The response carries the offending seat ids so the map can grey them out
  /// in place instead of navigating away.
  SEAT_UNAVAILABLE: 'SEAT_UNAVAILABLE',
  /// Too many requests are contending for the same seats. Retryable, unlike
  /// SEAT_UNAVAILABLE: the seats may still be free.
  SEATS_CONTENDED: 'SEATS_CONTENDED',
  /// The hold ran out before checkout completed.
  HOLD_EXPIRED: 'HOLD_EXPIRED',
  /// More seats requested than one booking allows.
  TOO_MANY_SEATS: 'TOO_MANY_SEATS',
  /// Booking has closed for this showtime.
  SALES_CLOSED: 'SALES_CLOSED',
  /// The same idempotency key arrived with a different body.
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  /// A request with this key is still running. Retry shortly.
  REQUEST_IN_PROGRESS: 'REQUEST_IN_PROGRESS',
  /// The gateway declined. Distinct from INTERNAL because the hold survives
  /// and the user can retry in place.
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  /// Too close to the screening to cancel. Carries the deadline that passed.
  CANCELLATION_CLOSED: 'CANCELLATION_CLOSED',
  /// The booking is not in a state that can be cancelled — already cancelled,
  /// already failed, or never confirmed.
  NOT_CANCELLABLE: 'NOT_CANCELLABLE',
  /// A promo code cannot be used here. `details.reason` says why.
  PROMO_INVALID: 'PROMO_INVALID',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}
