import { ERROR_CODES, type ErrorCode, type PromoReason } from '@app/shared';

/**
 * The only error type route code should throw. Anything else that escapes a
 * handler is treated as a bug and reported as a 500 with no internal detail.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  static badRequest(message: string, details?: Record<string, string[]>) {
    return new HttpError(400, ERROR_CODES.VALIDATION_FAILED, message, details);
  }
  static unauthorized(message = 'You need to sign in to do that') {
    return new HttpError(401, ERROR_CODES.UNAUTHORIZED, message);
  }
  static forbidden(message = 'You do not have access to this') {
    return new HttpError(403, ERROR_CODES.FORBIDDEN, message);
  }
  static notFound(message = 'Not found') {
    return new HttpError(404, ERROR_CODES.NOT_FOUND, message);
  }
  static conflict(message: string) {
    return new HttpError(409, ERROR_CODES.CONFLICT, message);
  }

  // --- Booking mechanic ------------------------------------------------------

  /**
   * Someone else took at least one of these seats first. The ids travel in
   * `details` so the seat map can grey exactly those seats out in place, which
   * is the difference between a good failure state and a modal.
   */
  static seatUnavailable(showSeatIds: string[]) {
    return new HttpError(
      409,
      ERROR_CODES.SEAT_UNAVAILABLE,
      showSeatIds.length === 1 ? 'That seat was just taken' : 'Some of those seats were just taken',
      { unavailableShowSeatIds: showSeatIds },
    );
  }

  /**
   * Too many people are trying for these exact seats at once. Distinct from
   * `seatUnavailable` because the seats may yet be free: the honest answer is
   * "try again", and the client retries rather than greying anything out.
   */
  static seatsContended() {
    return new HttpError(
      409,
      ERROR_CODES.SEATS_CONTENDED,
      'Those seats are being booked right now. Try again.',
    );
  }

  static holdExpired(message = 'Your seats were released because the hold ran out') {
    return new HttpError(410, ERROR_CODES.HOLD_EXPIRED, message);
  }

  /** 422: the request was well formed, but this code cannot be applied to it. */
  static promoInvalid(reason: PromoReason, message: string) {
    return new HttpError(422, ERROR_CODES.PROMO_INVALID, message, { reason: [reason] });
  }

  static tooManySeats(max: number) {
    return new HttpError(
      400,
      ERROR_CODES.TOO_MANY_SEATS,
      `You can book at most ${max} seats at a time`,
    );
  }

  static salesClosed(message = 'Booking has closed for this show') {
    return new HttpError(409, ERROR_CODES.SALES_CLOSED, message);
  }

  static idempotencyKeyReused() {
    return new HttpError(
      422,
      ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
      'That idempotency key was already used with a different request',
    );
  }

  static requestInProgress() {
    return new HttpError(
      409,
      ERROR_CODES.REQUEST_IN_PROGRESS,
      'An identical request is still being processed. Retry in a moment.',
    );
  }

  static cancellationClosed(deadline: Date) {
    return new HttpError(
      409,
      ERROR_CODES.CANCELLATION_CLOSED,
      'This booking can no longer be cancelled',
      { deadline: [deadline.toISOString()] },
    );
  }

  static notCancellable(message: string) {
    return new HttpError(409, ERROR_CODES.NOT_CANCELLABLE, message);
  }

  static paymentFailed(reason: string) {
    return new HttpError(402, ERROR_CODES.PAYMENT_FAILED, reason);
  }
}
