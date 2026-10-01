import { describe, expect, it } from 'vitest';
import { __testing, verifyQrPayload } from './bookings.service';

/**
 * `verifyQrPayload` backs the gate scanner: a forged ticket here means free
 * entry. These pin the one property that matters, that only the exact
 * signature validates, not any value that happens to be a suffix of it.
 */
describe('verifyQrPayload', () => {
  it('accepts a correctly signed payload', () => {
    const payload = __testing.qrPayload({
      reference: 'BOX123',
      showtimeId: 'show-1',
      seatCount: 2,
    });
    expect(verifyQrPayload(payload)).toBe(true);
  });

  it('rejects a tampered seat count even though the body still parses', () => {
    const payload = __testing.qrPayload({
      reference: 'BOX123',
      showtimeId: 'show-1',
      seatCount: 2,
    });
    const [reference, showtimeId, , signature] = payload.split('|');
    expect(verifyQrPayload(`${reference}|${showtimeId}|7|${signature}`)).toBe(false);
  });

  it('rejects a payload with no signature', () => {
    expect(verifyQrPayload('BOX123|show-1|2|')).toBe(false);
  });

  it('rejects a payload with a short, partially-matching signature', () => {
    const payload = __testing.qrPayload({
      reference: 'BOX123',
      showtimeId: 'show-1',
      seatCount: 2,
    });
    const [reference, showtimeId, seatCount, realSignature = ''] = payload.split('|');
    // Every prefix of the real signature, including empty, must fail: only
    // an exact, full-length match may pass.
    for (let len = 0; len < realSignature.length; len++) {
      const guess = realSignature.slice(realSignature.length - len);
      expect(verifyQrPayload(`${reference}|${showtimeId}|${seatCount}|${guess}`)).toBe(false);
    }
  });

  it('rejects a payload for a different booking', () => {
    const fakeSignature = 'A'.repeat(22);
    expect(verifyQrPayload(`BOX999|show-9|4|${fakeSignature}`)).toBe(false);
  });

  it('rejects a payload missing a field', () => {
    expect(verifyQrPayload('BOX123|show-1')).toBe(false);
    expect(verifyQrPayload('')).toBe(false);
  });
});
