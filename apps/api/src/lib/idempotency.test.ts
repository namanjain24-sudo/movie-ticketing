import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db';
import { createUser, resetDb, type TestUser } from '../test/helpers';
import { hashRequest, withIdempotency } from './idempotency';

/**
 * The claim's stale-takeover path writes with a raw `ON CONFLICT ... DO
 * UPDATE`, which bypasses the ordinary row checks. It is covered on its own
 * because that is exactly the kind of statement where "looks right" and "is
 * right" diverge: a WHERE clause missing one column is invisible in a diff
 * and only shows up as a cross-user leak under a very specific race.
 */
describe('withIdempotency stale-claim takeover', () => {
  let alice: TestUser;
  let bob: TestUser;
  const scope = 'test-scope';
  const body = { showSeatIds: ['seat-1', 'seat-2'] };
  const requestHash = hashRequest(body);

  beforeEach(async () => {
    await resetDb();
    alice = await createUser('alice');
    bob = await createUser('bob');
  });

  async function seedStaleInFlight(ownerId: string, key: string) {
    await prisma.idempotencyRecord.create({
      data: {
        key,
        scope,
        userId: ownerId,
        requestHash,
        state: 'IN_FLIGHT',
        createdAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
  }

  it('refuses to take over another user\'s stale claim, even with a matching request', async () => {
    const key = 'shared-key-cross-user';
    await seedStaleInFlight(alice.id, key);

    const run = vi.fn();
    await expect(
      withIdempotency({ key, scope, userId: bob.id, request: body, run }),
    ).rejects.toMatchObject({ status: 422 });

    // The point of the bug: run() must never fire for a claim that belongs
    // to someone else, and the stored owner must stay Alice.
    expect(run).not.toHaveBeenCalled();
    const record = await prisma.idempotencyRecord.findUniqueOrThrow({ where: { key } });
    expect(record.userId).toBe(alice.id);
    expect(record.state).toBe('IN_FLIGHT');
  });

  it('still lets the same user resume after an abandoned attempt', async () => {
    const key = 'shared-key-same-user';
    await seedStaleInFlight(alice.id, key);

    const run = vi.fn().mockResolvedValue({ status: 201, body: { ok: true } });
    const result = await withIdempotency({ key, scope, userId: alice.id, request: body, run });

    expect(run).toHaveBeenCalledOnce();
    expect(result.replayed).toBe(false);
    expect(result.body).toEqual({ ok: true });
  });
});
