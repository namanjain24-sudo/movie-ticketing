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
  type TestShowtime,
  type TestUser,
} from '../../test/helpers';

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
  });
});
