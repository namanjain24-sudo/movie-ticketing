import { prisma, type Tx } from '../db';
import { logger } from '../logger';
import { LOCK_TIMEOUT_SQLSTATE, RETRYABLE_SQLSTATES, sqlState } from './sql-state';

export function isRetryableTxError(err: unknown): boolean {
  const state = sqlState(err);
  return state !== undefined && RETRYABLE_SQLSTATES.has(state);
}

/** `lock_not_available`: the row was locked by someone else for too long. */
export function isLockTimeout(err: unknown): boolean {
  return sqlState(err) === LOCK_TIMEOUT_SQLSTATE;
}

/**
 * Bounds how long a transaction will wait for a row lock.
 *
 * Without this, a contended hold waits until Prisma's transaction timeout and
 * the user watches a spinner for five seconds before being told the seat is
 * gone. With it, the wait is bounded and the p99 of the hold endpoint stops
 * being decided by the slowest lock holder.
 *
 * The value is deliberately far longer than an uncontended hold needs, so it
 * only ever fires under genuine pileups. `SET LOCAL` scopes it to this
 * transaction and is undone by the commit.
 */
export async function setLockTimeout(tx: Tx, milliseconds = 1_500): Promise<void> {
  await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${Math.round(milliseconds)}ms'`);
}

/**
 * Runs a transaction, retrying only the errors that Postgres guarantees left
 * no trace. Deadlocks are possible here despite the deterministic lock
 * ordering in the hold query, because a hold and the sweeper can touch the
 * same rows from different directions. A retry is the correct response, and
 * retrying is safe precisely because the failed attempt rolled back whole.
 *
 * Anything else propagates untouched: retrying an unknown failure is how a
 * booking system charges someone twice.
 */
export async function withTxRetry<T>(
  fn: (tx: Tx) => Promise<T>,
  options: { attempts?: number; timeoutMs?: number; label?: string } = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        // Short. A hold transaction that takes longer than this is queued
        // behind a lock it is never going to win in time for the user.
        timeout: options.timeoutMs ?? 5_000,
        maxWait: 5_000,
      });
    } catch (err) {
      lastError = err;
      if (!isRetryableTxError(err) || attempt === attempts) throw err;
      logger.warn(
        { attempt, label: options.label, code: sqlState(err) },
        'Retryable transaction conflict',
      );
      // Jittered backoff, so two contending transactions do not collide again
      // in lockstep.
      await new Promise((r) => setTimeout(r, Math.random() * 20 * attempt));
    }
  }

  throw lastError;
}

/**
 * The database clock, read inside the caller's transaction. Every expiry
 * decision in the system is made against this, never against the API
 * process's clock, so multiple API instances with drifting clocks cannot
 * disagree about whether a hold is still alive.
 */
export async function dbNow(client: Pick<Tx, '$queryRaw'>): Promise<Date> {
  const rows = await client.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
  const now = rows[0]?.now;
  if (!now) throw new Error('Database returned no clock reading');
  return now;
}
