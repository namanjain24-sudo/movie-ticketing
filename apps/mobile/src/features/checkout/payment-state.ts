import type { PaymentStatusResult } from '@app/shared';

/**
 * What the checkout screen is allowed to say about a payment it has started.
 *
 * Pulled out of the screen because getting it wrong is invisible until it
 * happens to somebody: a declined card looked, on a device, exactly like a
 * payment that had not come back yet — a spinner that never stopped.
 *
 * The cause was reading the wrong field. The server reports a decline on the
 * *payment*:
 *
 *     { status: 'FAILED', bookingStatus: 'PENDING', failureReason: '...' }
 *
 * and leaves the booking PENDING on purpose, because the hold is still good
 * and the whole point is that you can try another method in place rather than
 * being thrown back to the seat map. The screen only looked at
 * `bookingStatus`, so it saw PENDING and kept waiting. The booking does turn
 * CANCELLED eventually — when the sweeper collects the expired hold, minutes
 * later — which is why the decline notice did finally appear, long after the
 * seats it offered to retry with were gone.
 *
 * So: the payment's own status decides, and the booking's status is read too,
 * for the paths that cancel it outright.
 */

/** Terminal states, after which polling learns nothing new. */
export function isSettled(result: PaymentStatusResult | undefined): boolean {
  if (!result) return false;
  if (result.status === 'FAILED' || result.status === 'REFUNDED') return true;
  return (
    result.bookingStatus === 'CONFIRMED' ||
    result.bookingStatus === 'FAILED' ||
    result.bookingStatus === 'CANCELLED'
  );
}

/**
 * The decline message, or null when nothing has been declined.
 *
 * Never an empty string: a reason the server left null still has to read as a
 * decline rather than as a blank card.
 */
export function declineReason(result: PaymentStatusResult | undefined): string | null {
  if (!result) return null;
  const failed =
    result.status === 'FAILED' ||
    result.bookingStatus === 'FAILED' ||
    result.bookingStatus === 'CANCELLED';
  if (!failed) return null;
  return result.failureReason ?? 'The payment was declined.';
}

/**
 * Whether the screen is still waiting on an outcome.
 *
 * `submitting` belongs here, not just the payment id. The id only exists once
 * the charge has come back, so between tapping Pay and that response the
 * screen used to count as "not waiting" — and a countdown crossing zero in
 * that window swapped the checkout for "your seats were released, nothing was
 * charged" while the request was still in flight and could still succeed.
 */
export function isWaiting(params: {
  result: PaymentStatusResult | undefined;
  paymentId: string | null;
  submitting: boolean;
}): boolean {
  const started = params.paymentId !== null || params.submitting;
  return started && !isSettled(params.result);
}
