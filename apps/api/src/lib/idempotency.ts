import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { prisma } from '../db';
import { env } from '../env';
import { HttpError } from '../http/errors';
import { logger } from '../logger';

/**
 * Replay protection for the two endpoints where running the work twice costs
 * the user money: creating a hold and starting a payment.
 *
 * The shape is the one payment gateways use, and the important detail is the
 * ordering: the key is *claimed in its own committed transaction before the
 * work starts*. Recording the key afterwards would leave a window in which a
 * retry arrives, sees nothing, and runs the work a second time, which is
 * exactly the bug this exists to prevent.
 */

/** An in-flight claim older than this is assumed abandoned and taken over. */
const STALE_INFLIGHT_MS = 30_000;

export interface IdempotentOutcome<T> {
  status: number;
  body: T;
}

/** Reads and validates the header. Absent is a client bug, so it is a 400. */
export function requireIdempotencyKey(req: Request): string {
  const key = req.header('idempotency-key')?.trim();
  if (!key) {
    throw HttpError.badRequest('This endpoint requires an Idempotency-Key header');
  }
  if (key.length < 8 || key.length > 200) {
    throw HttpError.badRequest('Idempotency-Key must be between 8 and 200 characters');
  }
  return key;
}

/** Stable hash of the request, so key reuse with a different body is caught. */
function hashRequest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(',')}}`;
}

export async function withIdempotency<T>(params: {
  key: string;
  /** Route identifier, so the same key on two endpoints cannot collide. */
  scope: string;
  userId: string;
  request: unknown;
  run: () => Promise<IdempotentOutcome<T>>;
}): Promise<IdempotentOutcome<T> & { replayed: boolean }> {
  const { key, scope, userId } = params;
  const requestHash = hashRequest(params.request);
  const expiresAt = new Date(Date.now() + env.IDEMPOTENCY_TTL_SECONDS * 1000);

  const claimed = await claim({ key, scope, userId, requestHash, expiresAt });

  if (!claimed) {
    const existing = await prisma.idempotencyRecord.findUnique({ where: { key } });
    // Vanished between the failed insert and this read: its TTL sweep or a
    // rollback removed it. Telling the client to retry is honest and safe.
    if (!existing) throw HttpError.requestInProgress();

    if (existing.requestHash !== requestHash || existing.scope !== scope) {
      throw HttpError.idempotencyKeyReused();
    }
    if (existing.state === 'COMPLETED') {
      return {
        status: existing.responseStatus ?? 200,
        body: existing.responseBody as T,
        replayed: true,
      };
    }
    // Still running somewhere. A 409 with a retry is far better than a second
    // charge, so the ambiguity is pushed to the client on purpose.
    throw HttpError.requestInProgress();
  }

  try {
    const outcome = await params.run();
    await complete(key, outcome.status, outcome.body);
    return { ...outcome, replayed: false };
  } catch (err) {
    if (err instanceof HttpError) {
      // A domain failure is a real, deterministic answer. Storing it means a
      // retry gets the same decline rather than a second attempt at the
      // gateway.
      await complete(key, err.status, {
        error: { code: err.code, message: err.message, details: err.details },
      });
      throw err;
    }
    // An unexpected failure has an unknown outcome, so the claim is dropped
    // and the client is allowed to genuinely retry.
    await prisma.idempotencyRecord.deleteMany({ where: { key, state: 'IN_FLIGHT' } });
    throw err;
  }
}

/**
 * Claims the key, or takes over a claim whose owner appears to have died.
 * Returns false when another live request holds it.
 */
async function claim(input: {
  key: string;
  scope: string;
  userId: string;
  requestHash: string;
  expiresAt: Date;
}): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_INFLIGHT_MS);

  // A single statement, so two racing requests cannot both believe they won.
  // `ON CONFLICT ... WHERE` lets the takeover of an abandoned claim happen in
  // the same atomic step as the initial insert.
  const rows = await prisma.$queryRaw<{ key: string }[]>`
    INSERT INTO "IdempotencyRecord"
      ("key", "scope", "userId", "requestHash", "state", "createdAt", "expiresAt")
    VALUES (
      ${input.key}, ${input.scope}, ${input.userId}, ${input.requestHash},
      'IN_FLIGHT', now(), ${input.expiresAt}
    )
    ON CONFLICT ("key") DO UPDATE
      SET "createdAt" = now(), "expiresAt" = ${input.expiresAt}
      WHERE "IdempotencyRecord"."state" = 'IN_FLIGHT'
        AND "IdempotencyRecord"."createdAt" < ${staleBefore}
        AND "IdempotencyRecord"."requestHash" = ${input.requestHash}
    RETURNING "key"
  `;

  return rows[0]?.key === input.key;
}

async function complete(key: string, status: number, body: unknown): Promise<void> {
  try {
    await prisma.idempotencyRecord.update({
      where: { key },
      data: {
        state: 'COMPLETED',
        responseStatus: status,
        responseBody: body as never,
        completedAt: new Date(),
      },
    });
  } catch (err) {
    // The work already succeeded and its result is durable. Failing the
    // response now would tell the user their booking failed when it did not.
    logger.error({ err, key }, 'Could not record idempotent result');
  }
}

/** Removes expired records. Called by the sweeper; purely housekeeping. */
export async function purgeExpiredIdempotencyRecords(): Promise<number> {
  const { count } = await prisma.idempotencyRecord.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
