import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time string comparison. `timingSafeEqual` throws on mismatched
 * buffer sizes rather than reporting a clean "not equal", so the length
 * check has to come first — and it is safe to do so in variable time,
 * because a length mismatch leaks nothing an attacker does not already know
 * from having sent the payload.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
