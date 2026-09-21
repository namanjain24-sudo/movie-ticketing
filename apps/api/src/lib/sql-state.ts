/**
 * Pulls the Postgres SQLSTATE out of whatever Prisma hands back.
 *
 * This is fiddly enough to be worth its own file. Prisma reports a raw-query
 * failure as `P2010` and buries the real code inside the driver adapter's
 * error, so a handler that only reads `err.code` sees a generic Prisma error
 * and treats lock contention as an internal fault. That is exactly the bug
 * that turned 57 retryable conflicts into 500s in one load run.
 *
 * Several shapes are checked because the location depends on whether the query
 * went through the query engine or the driver adapter, and the message is used
 * as a last resort because that string is the only place the code appears in
 * some versions.
 */
export function sqlState(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;

  const e = err as {
    code?: unknown;
    meta?: {
      code?: unknown;
      driverAdapterError?: { cause?: { code?: unknown; originalCode?: unknown } };
    };
    message?: unknown;
  };

  const candidates = [
    e.meta?.driverAdapterError?.cause?.code,
    e.meta?.driverAdapterError?.cause?.originalCode,
    e.meta?.code,
    // Prisma's own P-codes live here too, so this is checked last and filtered
    // below to five-character SQLSTATEs.
    e.code,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && /^[0-9A-Z]{5}$/.test(candidate) && candidate[0] !== 'P') {
      return candidate;
    }
  }

  if (typeof e.message === 'string') {
    const match = /Code: `([0-9A-Z]{5})`/.exec(e.message);
    if (match?.[1]) return match[1];
  }

  return undefined;
}

/** Nothing was written; the same transaction can safely be run again. */
export const RETRYABLE_SQLSTATES = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
]);

/** Waited too long for a row lock. Contention, not a fault. */
export const LOCK_TIMEOUT_SQLSTATE = '55P03';

/**
 * The connection died. Each of these guarantees the transaction rolled back
 * rather than half-applied, so the honest answer to the client is "retry".
 */
export const TRANSIENT_SQLSTATES = new Set([
  '57P01', // admin_shutdown: terminated by pg_terminate_backend
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now: still starting up
  '08000', // connection_exception
  '08001', // unable to establish connection
  '08003', // connection_does_not_exist
  '08004', // rejected connection
  '08006', // connection_failure
]);
