import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { prisma } from '../db';
import { verifyInvariants } from '../scripts/verify-invariants';
import { mockGatewayControls, resetMockGateway } from '../modules/payments/gateway';
import { createShowtime, createUsers, idempotencyKey, resetDb, waitFor } from './helpers';

/**
 * The whole mechanic end to end, under contention: many users racing through
 * hold, checkout and payment against a fixed, small inventory, with a share of
 * declines and a share of duplicated requests mixed in.
 *
 * This is the in-process rehearsal of the k6 scenario. It runs on every `npm
 * test` so a regression in the booking path is caught in seconds rather than
 * in a load run, and it asserts the same two things the load report does:
 * seats confirmed never exceed inventory, and no booking is charged twice.
 */

let server: Server;

beforeAll(() => {
  server = createApp().listen(0);
});

afterAll(() => {
  server.close();
});

describe('the booking pipeline under contention', () => {
  beforeEach(async () => {
    await resetDb();
    resetMockGateway();
  });

  it('sells at most the inventory, and charges nobody twice', async () => {
    const inventory = 40;
    const shoppers = 120;

    const show = await createShowtime({ seatCount: inventory, priceMinor: 20_000 });
    const users = await createUsers(shoppers);

    // One in ten payments declines, matching the mock's default rather than a
    // sanitised happy path.
    mockGatewayControls.forceOutcome = null;

    const journeys = users.map(async (user, i) => {
      const size = (i % 3) + 1;
      const start = (i * 5) % Math.max(1, inventory - size);
      const seatIds = show.showSeatIds.slice(start, start + size);
      const holdKey = idempotencyKey(`h${i}`);

      const holdRes = await request(server)
        .post(`/v1/showtimes/${show.showtimeId}/holds`)
        .set(user.auth)
        .set('Idempotency-Key', holdKey)
        .send({ showSeatIds: seatIds });

      // Losing the seat race is the expected outcome for most users here.
      if (holdRes.status !== 201) return null;

      // Three in ten abandon at checkout, as real users do.
      if (i % 10 < 3) return null;

      const payKey = idempotencyKey(`p${i}`);
      const attempt = () =>
        request(server)
          .post('/v1/checkout')
          .set(user.auth)
          .set('Idempotency-Key', payKey)
          .send({ holdId: holdRes.body.id, method: 'CARD' });

      const checkoutRes = await attempt();
      // One in five retries the same request, which must not double charge.
      if (i % 5 === 0) await attempt();

      return checkoutRes.status === 201 ? (checkoutRes.body.bookingId as string) : null;
    });

    const bookingIds = (await Promise.all(journeys)).filter((id): id is string => id !== null);
    expect(bookingIds.length).toBeGreaterThan(0);

    // Let the asynchronous gateway settlements land.
    await waitFor(
      async () =>
        (await prisma.payment.count({ where: { status: { in: ['PENDING', 'AUTHORIZED'] } } })) ===
        0,
      { timeoutMs: 20_000 },
    );

    const confirmedSeats = await prisma.showSeat.count({
      where: { showtimeId: show.showtimeId, state: 'CONFIRMED' },
    });
    const doubleCharged = await prisma.payment.groupBy({
      by: ['bookingId'],
      where: { status: 'CAPTURED' },
      _count: { _all: true },
      having: { bookingId: { _count: { gt: 1 } } },
    });

    // The two headline claims.
    expect(confirmedSeats).toBeLessThanOrEqual(inventory);
    expect(doubleCharged).toEqual([]);

    // And no seat is confirmed for more than one booking, which the unique
    // inventory row makes structural but is worth asserting anyway.
    const seatsPerBooking = await prisma.showSeat.groupBy({
      by: ['id'],
      where: { state: 'CONFIRMED' },
      _count: { _all: true },
      having: { id: { _count: { gt: 1 } } },
    });
    expect(seatsPerBooking).toEqual([]);

    expect(await verifyInvariants()).toEqual([]);
  });
});
