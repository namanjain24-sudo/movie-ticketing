import type {
  Booking,
  BookingList,
  Cancellation,
  CancellationQuote,
  CheckoutInput,
  CheckoutResult,
  CreateHoldInput,
  Hold,
  PaymentStatusResult,
  SeatConflict,
} from '@app/shared';
import { seatConflictSchema } from '@app/shared';
import { ApiRequestError, api } from './client';

export const bookingApi = {
  /**
   * `key` must be stable across retries of one tap. See `lib/idempotency`.
   */
  createHold: (showtimeId: string, input: CreateHoldInput, key: string) =>
    api.post<Hold>(`/v1/showtimes/${encodeURIComponent(showtimeId)}/holds`, input, {
      headers: { 'Idempotency-Key': key },
    }),

  hold: (holdId: string) => api.get<Hold>(`/v1/holds/${encodeURIComponent(holdId)}`),

  releaseHold: (holdId: string) => api.delete<void>(`/v1/holds/${encodeURIComponent(holdId)}`),

  checkout: (input: CheckoutInput, key: string) =>
    api.post<CheckoutResult>('/v1/checkout', input, {
      headers: { 'Idempotency-Key': key },
    }),

  payment: (paymentId: string) =>
    api.get<PaymentStatusResult>(`/v1/payments/${encodeURIComponent(paymentId)}`),

  bookings: () => api.get<BookingList>('/v1/bookings'),

  /** Read before offering to cancel, so the refund is quoted, not guessed. */
  cancellationQuote: (bookingId: string) =>
    api.get<CancellationQuote>(`/v1/bookings/${encodeURIComponent(bookingId)}/cancellation`),

  cancelBooking: (bookingId: string) =>
    api.post<Cancellation>(`/v1/bookings/${encodeURIComponent(bookingId)}/cancel`),

  bookingByReference: (reference: string) =>
    api.get<Booking>(`/v1/bookings/reference/${encodeURIComponent(reference)}`),
};

/**
 * Pulls the seat ids out of a 409 so the map can grey exactly those seats in
 * place. Returns null for every other failure, including a conflict whose
 * details do not parse, because guessing which seats went would be worse than
 * showing the generic message.
 */
export function seatConflictFrom(error: unknown): SeatConflict | null {
  if (!(error instanceof ApiRequestError) || error.code !== 'SEAT_UNAVAILABLE') return null;
  const parsed = seatConflictSchema.safeParse(error.details);
  return parsed.success ? parsed.data : null;
}
