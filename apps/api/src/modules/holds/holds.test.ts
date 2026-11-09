import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@app/shared';
import { createApp } from '../../app';
import { prisma } from '../../db';
import { sweepOnce } from '../../jobs/sweeper';
import {
  createShowtime,
  createUser,
  expireHold,
  idempotencyKey,
  resetDb,
  waitFor,
  type TestShowtime,
  type TestUser,
} from '../../test/helpers';
import { mockGatewayControls, resetMockGateway } from '../payments/gateway';

const app = createApp();

describe('holds', () => {
  let show: TestShowtime;
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    await resetDb();
    show = await createShowtime({ seatCount: 10, priceMinor: 25_000 });
    alice = await createUser('alice');
    bob = await createUser('bob');
  });

  function hold(user: TestUser, showSeatIds: string[], key = idempotencyKey()) {
    return request(app)
      .post(`/v1/showtimes/${show.showtimeId}/holds`)
      .set(user.auth)
      .set('Idempotency-Key', key)
      .send({ showSeatIds });
  }

  it('holds the requested seats and prices them', async () => {
    const res = await hold(alice, show.showSeatIds.slice(0, 3)).expect(201);

    expect(res.body.seats).toHaveLength(3);
    expect(res.body.subtotalMinor).toBe(75_000);
    expect(res.body.totalMinor).toBe(res.body.subtotalMinor + res.body.feeMinor);
    expect(res.body.status).toBe('ACTIVE');
    // The countdown is anchored to these two values, never to the device clock.
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(
      new Date(res.body.serverTime).getTime(),
    );
  });

  it('refuses a seat another user already holds, and names it', async () => {
    const [seat] = show.showSeatIds;
    await hold(alice, [seat!]).expect(201);

    const res = await hold(bob, [seat!]).expect(409);
    expect(res.body.error.code).toBe(ERROR_CODES.SEAT_UNAVAILABLE);
    // The seat map greys out exactly these ids rather than reloading.
    expect(res.body.error.details.unavailableShowSeatIds).toEqual([seat]);
  });

  it('is all-or-nothing: one taken seat leaves the others free', async () => {
    const [first, second, third] = show.showSeatIds;
    await hold(alice, [second!]).expect(201);

    await hold(bob, [first!, second!, third!]).expect(409);

    // A partial hold would have stranded these two.
    const states = await prisma.showSeat.findMany({
      where: { id: { in: [first!, third!] } },
      select: { state: true },
    });
    expect(states.map((s) => s.state)).toEqual(['AVAILABLE', 'AVAILABLE']);
  });

  it('treats an expired hold as available without the sweeper running', async () => {
    const [seat] = show.showSeatIds;
    const created = await hold(alice, [seat!]).expect(201);
    await expireHold(created.body.id);

    // No sweep. Expiry is decided on the read path, so the seat is already free.
    await hold(bob, [seat!]).expect(201);

    const row = await prisma.showSeat.findUniqueOrThrow({ where: { id: seat! } });
    expect(row.state).toBe('HELD');
  });

  it('reports an expired hold as expired even before it is swept', async () => {
    const created = await hold(alice, show.showSeatIds.slice(0, 2)).expect(201);
    await expireHold(created.body.id);

    const res = await request(app).get(`/v1/holds/${created.body.id}`).set(alice.auth).expect(200);
    expect(res.body.status).toBe('EXPIRED');
  });

  it('returns the same hold when the request is retried with one key', async () => {
    const key = idempotencyKey('retry');
    const first = await hold(alice, show.showSeatIds.slice(0, 2), key).expect(201);
    const second = await hold(alice, show.showSeatIds.slice(0, 2), key).expect(201);

    expect(second.body.id).toBe(first.body.id);
    expect(second.headers['idempotent-replay']).toBe('true');
    expect(await prisma.hold.count()).toBe(1);
  });

  it('replays the original conflict rather than retrying it', async () => {
    const [seat] = show.showSeatIds;
    await hold(alice, [seat!]).expect(201);

    const key = idempotencyKey('conflict');
    await hold(bob, [seat!], key).expect(409);
    const replay = await hold(bob, [seat!], key).expect(409);
    expect(replay.headers['idempotent-replay']).toBe('true');
  });

  it('rejects a key reused with a different body', async () => {
    const key = idempotencyKey('reuse');
    await hold(alice, show.showSeatIds.slice(0, 1), key).expect(201);

    const res = await hold(alice, show.showSeatIds.slice(1, 2), key).expect(422);
    expect(res.body.error.code).toBe(ERROR_CODES.IDEMPOTENCY_KEY_REUSED);
  });

  it('never hands one user the result of another user reusing the same key', async () => {
    // The key is `@app/mobile`'s own Math.random()-based string, not a
    // cryptographic UUID, and nothing stops a client from hand-crafting the
    // header, so the server is the only thing standing between two users who
    // submit the same literal key (even with matching bodies) and one of
    // them getting handed the other's hold.
    const key = idempotencyKey('cross-user');
    const seats = show.showSeatIds.slice(0, 1);
    const aliceHold = await hold(alice, seats, key).expect(201);

    const res = await hold(bob, seats, key).expect(422);
    expect(res.body.error.code).toBe(ERROR_CODES.IDEMPOTENCY_KEY_REUSED);
    expect(res.body.id).not.toBe(aliceHold.body.id);
  });

  it('requires an idempotency key', async () => {
    await request(app)
      .post(`/v1/showtimes/${show.showtimeId}/holds`)
      .set(alice.auth)
      .send({ showSeatIds: show.showSeatIds.slice(0, 1) })
      .expect(400);
  });

  it('collapses a seat listed twice instead of reading it as a conflict', async () => {
    const [seat] = show.showSeatIds;
    const res = await hold(alice, [seat!, seat!]).expect(201);
    expect(res.body.seats).toHaveLength(1);
  });

  it('releases seats immediately when the user backs out', async () => {
    const created = await hold(alice, show.showSeatIds.slice(0, 2)).expect(201);
    await request(app).delete(`/v1/holds/${created.body.id}`).set(alice.auth).expect(204);

    await hold(bob, show.showSeatIds.slice(0, 2)).expect(201);
  });

  it('treats releasing twice as success, because clients retry on unmount', async () => {
    const created = await hold(alice, show.showSeatIds.slice(0, 1)).expect(201);
    await request(app).delete(`/v1/holds/${created.body.id}`).set(alice.auth).expect(204);
    await request(app).delete(`/v1/holds/${created.body.id}`).set(alice.auth).expect(204);
  });

  it('hides another user’s hold behind a 404 rather than a 403', async () => {
    const created = await hold(alice, show.showSeatIds.slice(0, 1)).expect(201);
    await request(app).get(`/v1/holds/${created.body.id}`).set(bob.auth).expect(404);
  });

  it('caps the number of seats in one booking', async () => {
    const big = await createShowtime({ seatCount: 30 });
    const res = await request(app)
      .post(`/v1/showtimes/${big.showtimeId}/holds`)
      .set(alice.auth)
      .set('Idempotency-Key', idempotencyKey())
      .send({ showSeatIds: big.showSeatIds.slice(0, 15) })
      .expect(400);
    expect(res.body.error.code).toBe(ERROR_CODES.TOO_MANY_SEATS);
  });

  it('refuses a hold once sales have closed', async () => {
    const closed = await createShowtime({ seatCount: 5, startsInMinutes: -60 });
    const res = await request(app)
      .post(`/v1/showtimes/${closed.showtimeId}/holds`)
      .set(alice.auth)
      .set('Idempotency-Key', idempotencyKey())
      .send({ showSeatIds: closed.showSeatIds.slice(0, 1) })
      .expect(409);
    expect(res.body.error.code).toBe(ERROR_CODES.SALES_CLOSED);
  });

  it('shows the holder their own seats as theirs and hides other holders', async () => {
    const [seat] = show.showSeatIds;
    await hold(alice, [seat!]).expect(201);

    const asAlice = await request(app)
      .get(`/v1/showtimes/${show.showtimeId}/seatmap`)
      .set(alice.auth)
      .expect(200);
    const asBob = await request(app)
      .get(`/v1/showtimes/${show.showtimeId}/seatmap`)
      .set(bob.auth)
      .expect(200);

    const find = (body: { seats: { id: string; status: string }[] }) =>
      body.seats.find((s) => s.id === seat)!.status;
    expect(find(asAlice.body)).toBe('HELD_BY_YOU');
    expect(find(asBob.body)).toBe('UNAVAILABLE');
  });

  describe('the sweeper', () => {
    it('is housekeeping, not correctness: it tidies rows already treated as free', async () => {
      const created = await hold(alice, show.showSeatIds.slice(0, 3)).expect(201);
      await expireHold(created.body.id);

      const result = await sweepOnce();

      expect(result.seatsReleased).toBe(3);
      expect(result.holdsExpired).toBe(1);
      const rows = await prisma.showSeat.findMany({
        where: { id: { in: show.showSeatIds.slice(0, 3) } },
        select: { state: true, holdId: true, holdExpiresAt: true },
      });
      for (const row of rows) {
        expect(row.state).toBe('AVAILABLE');
        expect(row.holdId).toBeNull();
        expect(row.holdExpiresAt).toBeNull();
      }
    });

    it('leaves live holds alone', async () => {
      await hold(alice, show.showSeatIds.slice(0, 2)).expect(201);
      const result = await sweepOnce();
      expect(result.seatsReleased).toBe(0);
    });

    it('purges refresh tokens that can no longer authenticate anything', async () => {
      const user = await prisma.user.findFirstOrThrow();
      await prisma.refreshToken.createMany({
        data: [
          // Expired: useless to everyone.
          {
            id: 'rt-expired',
            tokenHash: 'h1',
            userId: user.id,
            expiresAt: new Date(Date.now() - 1000),
          },
          // Revoked long ago: reuse detection has nothing left to catch.
          {
            id: 'rt-old-revoked',
            tokenHash: 'h2',
            userId: user.id,
            expiresAt: new Date(Date.now() + 86_400_000),
            revokedAt: new Date(Date.now() - 30 * 86_400_000),
          },
          // Revoked just now: has to survive, because recognising it is what
          // proves a stolen token was replayed.
          {
            id: 'rt-fresh-revoked',
            tokenHash: 'h3',
            userId: user.id,
            expiresAt: new Date(Date.now() + 86_400_000),
            revokedAt: new Date(),
          },
          // Live.
          {
            id: 'rt-live',
            tokenHash: 'h4',
            userId: user.id,
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        ],
      });

      const result = await sweepOnce();

      expect(result.refreshTokensPurged).toBe(2);
      const left = (await prisma.refreshToken.findMany({ select: { id: true } })).map((r) => r.id);
      expect(left.sort()).toEqual(['rt-fresh-revoked', 'rt-live']);
    });
  });

  describe('per-user hold cap', () => {
    /**
     * The cap exists to stop one account sitting on a whole auditorium. The
     * per-request limit cannot do that on its own: ten seats a request at the
     * hold rate limit is three hundred seats a minute, and a seeded house is
     * one to four hundred seats.
     */
    it('refuses a hold that would take the account past the cap', async () => {
      const big = await createShowtime({ seatCount: 40, priceMinor: 10_000 });
      const seats = big.showSeatIds;

      const keep = (ids: string[]) =>
        request(app)
          .post(`/v1/showtimes/${big.showtimeId}/holds`)
          .set(alice.auth)
          .set('Idempotency-Key', idempotencyKey())
          .send({ showSeatIds: ids });

      // MAX_SEATS_HELD_PER_USER defaults to 20, so two full requests of ten.
      await keep(seats.slice(0, 10)).expect(201);
      await keep(seats.slice(10, 20)).expect(201);

      const res = await keep(seats.slice(20, 30)).expect(429);
      expect(res.body.error.code).toBe(ERROR_CODES.TOO_MANY_HOLDS);

      // And the refused request took nothing: those seats are still free.
      const rows = await prisma.showSeat.findMany({
        where: { id: { in: seats.slice(20, 30) } },
        select: { state: true },
      });
      expect(rows.every((r) => r.state === 'AVAILABLE')).toBe(true);
    });

    it('frees the budget again as soon as a hold lapses', async () => {
      const big = await createShowtime({ seatCount: 40, priceMinor: 10_000 });
      const seats = big.showSeatIds;
      const keep = (ids: string[]) =>
        request(app)
          .post(`/v1/showtimes/${big.showtimeId}/holds`)
          .set(alice.auth)
          .set('Idempotency-Key', idempotencyKey())
          .send({ showSeatIds: ids });

      const first = await keep(seats.slice(0, 10)).expect(201);
      await keep(seats.slice(10, 20)).expect(201);
      await keep(seats.slice(20, 30)).expect(429);

      // Logical expiry, with no sweeper run: the same rule the seat query uses.
      await expireHold(first.body.id);

      await keep(seats.slice(20, 30)).expect(201);
    });

    it('counts only the account that made the holds', async () => {
      const big = await createShowtime({ seatCount: 40, priceMinor: 10_000 });
      const seats = big.showSeatIds;
      const keep = (user: TestUser, ids: string[]) =>
        request(app)
          .post(`/v1/showtimes/${big.showtimeId}/holds`)
          .set(user.auth)
          .set('Idempotency-Key', idempotencyKey())
          .send({ showSeatIds: ids });

      await keep(alice, seats.slice(0, 10)).expect(201);
      await keep(alice, seats.slice(10, 20)).expect(201);
      await keep(alice, seats.slice(20, 30)).expect(429);
      // Bob's budget is his own.
      await keep(bob, seats.slice(20, 30)).expect(201);
    });
  });
});

/**
 * The cap on one screening, which is the one a buyer cannot walk around by
 * paying and coming back.
 *
 * `MAX_SEATS_HELD_PER_USER` counts live holds only, deliberately, so a lapsed
 * hold frees its budget at once. Every test here is shaped so that cap cannot
 * be the one that fires: the seats are already paid for, so nothing is on
 * hold when the refusal happens.
 */
describe('one account, one screening', () => {
  let big: TestShowtime;
  let other: TestShowtime;
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    await resetDb();
    resetMockGateway();
    mockGatewayControls.forceOutcome = 'SUCCESS';
    // Far enough ahead to stay cancellable, and big enough to exceed the cap.
    big = await createShowtime({ seatCount: 40, priceMinor: 20_000, startsInMinutes: 600 });
    other = await createShowtime({ seatCount: 10, priceMinor: 20_000, startsInMinutes: 600 });
    alice = await createUser('alice-cap');
    bob = await createUser('bob-cap');
  });

  const take = (user: TestUser, showtime: TestShowtime, seatIds: string[]) =>
    request(app)
      .post(`/v1/showtimes/${showtime.showtimeId}/holds`)
      .set(user.auth)
      .set('Idempotency-Key', idempotencyKey('cap'))
      .send({ showSeatIds: seatIds });

  /** Holds and pays for a slice of seats, and waits for it to confirm. */
  async function buy(user: TestUser, showtime: TestShowtime, seatIds: string[]) {
    const held = await take(user, showtime, seatIds).expect(201);
    const paid = await request(app)
      .post('/v1/checkout')
      .set(user.auth)
      .set('Idempotency-Key', idempotencyKey('cap-pay'))
      .send({ holdId: held.body.id, method: 'CARD' })
      .expect(201);
    await waitFor(async () => {
      const booking = await prisma.booking.findUnique({ where: { id: paid.body.bookingId } });
      return booking?.status === 'CONFIRMED';
    });
    return paid.body.bookingId as string;
  }

  it('counts seats already paid for, which is the whole point', async () => {
    // Two full bookings reach the cap of twenty. Nothing is on hold by now,
    // so the live-hold cap cannot be what refuses the third request.
    await buy(alice, big, big.showSeatIds.slice(0, 10));
    await buy(alice, big, big.showSeatIds.slice(10, 20));

    const res = await take(alice, big, big.showSeatIds.slice(20, 21)).expect(409);
    expect(res.body.error.code).toBe(ERROR_CODES.TOO_MANY_FOR_SHOWTIME);
  });

  it('lets an account reach the cap exactly', async () => {
    await buy(alice, big, big.showSeatIds.slice(0, 10));
    // The twentieth seat is allowed; it is the twenty-first that is not.
    await take(alice, big, big.showSeatIds.slice(10, 20)).expect(201);
  });

  it('counts what is on hold as well as what is bought', async () => {
    await buy(alice, big, big.showSeatIds.slice(0, 10));
    await take(alice, big, big.showSeatIds.slice(10, 20)).expect(201);

    // Ten bought plus ten held is the cap. Live holds are only ten, so the
    // hold cap still has room and this refusal is the per-screening one.
    const res = await take(alice, big, big.showSeatIds.slice(20, 21)).expect(409);
    expect(res.body.error.code).toBe(ERROR_CODES.TOO_MANY_FOR_SHOWTIME);
  });

  it('is per screening, not per account', async () => {
    await buy(alice, big, big.showSeatIds.slice(0, 10));
    await buy(alice, big, big.showSeatIds.slice(10, 20));

    // Twenty taken of one showing says nothing about another.
    await take(alice, other, other.showSeatIds.slice(0, 2)).expect(201);
  });

  it('does not count one account against another', async () => {
    await buy(alice, big, big.showSeatIds.slice(0, 10));
    await buy(alice, big, big.showSeatIds.slice(10, 20));

    await take(bob, big, big.showSeatIds.slice(20, 25)).expect(201);
  });

  it('gives the budget back when a booking is cancelled', async () => {
    const first = await buy(alice, big, big.showSeatIds.slice(0, 10));
    await buy(alice, big, big.showSeatIds.slice(10, 20));
    await take(alice, big, big.showSeatIds.slice(20, 21)).expect(409);

    await request(app).post(`/v1/bookings/${first}/cancel`).set(alice.auth).expect(200);

    // Those ten are no longer this account's, so there is room again. A cap
    // that counted a refunded booking forever would punish changing plans.
    await take(alice, big, big.showSeatIds.slice(20, 30)).expect(201);
  });
});
