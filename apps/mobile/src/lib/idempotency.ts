/**
 * Generates the `Idempotency-Key` a hold or checkout request carries.
 *
 * The value matters less than its lifetime: one key belongs to one user
 * intention, and every retry of that intention must reuse it. Generating a
 * fresh key inside a retry would defeat the whole mechanism, so callers hold
 * the key in a ref and only mint a new one when the user starts over.
 */
export function idempotencyKey(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 12);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}
