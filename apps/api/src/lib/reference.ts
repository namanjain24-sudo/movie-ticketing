import { randomBytes } from 'node:crypto';

/**
 * Crockford base32 without I, L, O or U: no character pairs a person can
 * confuse when reading a reference off a phone screen at a ticket counter.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** e.g. `BK-7F3K9Q`. 32^6 is ~1.07 billion, and uniqueness is enforced by the
 * database, so a collision costs one retry rather than a wrong ticket. */
export function bookingReference(): string {
  const bytes = randomBytes(6);
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return `BK-${out}`;
}
