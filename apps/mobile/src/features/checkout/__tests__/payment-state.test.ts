import type { PaymentStatusResult } from '@app/shared';
import { declineReason, isSettled, isWaiting } from '../payment-state';

function result(over: Partial<PaymentStatusResult> = {}): PaymentStatusResult {
  return {
    paymentId: 'pay_1',
    bookingId: 'bk_1',
    status: 'PENDING',
    bookingStatus: 'PENDING',
    failureReason: null,
    reference: null,
    ...over,
  };
}

/**
 * The shape the server actually sends when a card is declined, taken off a
 * running API rather than imagined: the payment fails and the booking stays
 * PENDING, because the hold is still good and the point is to let somebody
 * try another method in place.
 */
const DECLINED = result({
  status: 'FAILED',
  bookingStatus: 'PENDING',
  failureReason: 'Your bank declined the payment',
});

describe('a declined payment on a booking the server keeps PENDING', () => {
  it('is settled, so polling stops', () => {
    expect(isSettled(DECLINED)).toBe(true);
  });

  it('is not still waiting', () => {
    expect(isWaiting({ result: DECLINED, paymentId: 'pay_1', submitting: false })).toBe(false);
  });

  it('is reported with the bank’s own reason', () => {
    expect(declineReason(DECLINED)).toBe('Your bank declined the payment');
  });
});

describe('while the outcome is unknown', () => {
  it('waits from the tap, before a payment id exists', () => {
    expect(isWaiting({ result: undefined, paymentId: null, submitting: true })).toBe(true);
  });

  it('is not waiting before anything has been submitted', () => {
    expect(isWaiting({ result: undefined, paymentId: null, submitting: false })).toBe(false);
  });

  it('keeps polling a payment that has not come back', () => {
    expect(isSettled(result())).toBe(false);
    expect(isWaiting({ result: result(), paymentId: 'pay_1', submitting: false })).toBe(true);
    expect(declineReason(result())).toBeNull();
  });

  it('keeps polling a captured payment whose booking is not confirmed yet', () => {
    const captured = result({ status: 'CAPTURED', bookingStatus: 'PENDING' });
    expect(isSettled(captured)).toBe(false);
    expect(declineReason(captured)).toBeNull();
  });
});

describe('a payment that went through', () => {
  const confirmed = result({
    status: 'CAPTURED',
    bookingStatus: 'CONFIRMED',
    reference: 'BK-ABC123',
  });

  it('is settled and is not a decline', () => {
    expect(isSettled(confirmed)).toBe(true);
    expect(declineReason(confirmed)).toBeNull();
    expect(isWaiting({ result: confirmed, paymentId: 'pay_1', submitting: false })).toBe(false);
  });
});

describe('the paths that end the booking outright', () => {
  it.each(['FAILED', 'CANCELLED'] as const)('treats bookingStatus %s as declined', (status) => {
    const row = result({ bookingStatus: status, failureReason: 'Hold expired' });
    expect(isSettled(row)).toBe(true);
    expect(declineReason(row)).toBe('Hold expired');
    expect(isWaiting({ result: row, paymentId: 'pay_1', submitting: false })).toBe(false);
  });

  it('never shows an empty decline card when the server gave no reason', () => {
    const row = result({ status: 'FAILED', failureReason: null });
    expect(declineReason(row)).toBe('The payment was declined.');
  });
});

describe('a refund', () => {
  it('stops the polling rather than being chased for ever', () => {
    expect(isSettled(result({ status: 'REFUNDED', bookingStatus: 'CANCELLED' }))).toBe(true);
  });
});
