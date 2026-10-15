import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@app/shared';
import { createApp } from '../../app';
import { prisma } from '../../db';
import {
  createShowtime,
  createUser,
  idempotencyKey,
  resetDb,
  waitFor,
  type TestShowtime,
  type TestUser,
} from '../../test/helpers';
import { mockGatewayControls, resetMockGateway } from '../payments/gateway';

const app = createApp();

describe('splitting the bill', () => {
  let show: TestShowtime;
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    await resetDb();
    resetMockGateway();
    mockGatewayControls.forceOutcome = 'SUCCESS';
    show = await createShowtime({ seatCount: 10, priceMinor: 25_000, startsInMinutes: 600 });
    alice = await createUser('alice');
    bob = await createUser('bob');
  });

  /** Takes a booking all the way to CONFIRMED, the way the app does. Two
   * seats at 25_000 each, plus the default 3_000 fee: 53_000 total. */
  async function book(user: TestUser, seatIds: string[]) {
    const hold = await request(app)
      .post(`/v1/showtimes/${show.showtimeId}/holds`)
      .set(user.auth)
      .set('Idempotency-Key', idempotencyKey())
      .send({ showSeatIds: seatIds })
      .expect(201);

    const checkout = await request(app)
      .post('/v1/checkout')
      .set(user.auth)
      .set('Idempotency-Key', idempotencyKey())
      .send({ holdId: hold.body.id })
      .expect(201);

    await waitFor(async () => {
      const booking = await prisma.booking.findUnique({
        where: { id: checkout.body.bookingId },
        select: { status: true },
      });
      return booking?.status === 'CONFIRMED';
    });

    return checkout.body.bookingId as string;
  }

  const getSplit = (user: TestUser, bookingId: string) =>
    request(app).get(`/v1/bookings/${bookingId}/split`).set(user.auth);

  const setSplit = (user: TestUser, bookingId: string, shares: unknown) =>
    request(app).post(`/v1/bookings/${bookingId}/split`).set(user.auth).send({ shares });

  it('starts with no shares', async () => {
    const id = await book(alice, show.showSeatIds.slice(0, 2));
    const res = await getSplit(alice, id).expect(200);
    expect(res.body).toMatchObject({ bookingId: id, totalMinor: 53_000, shares: [] });
  });

  it('splits the whole bill across shares that add up to it', async () => {
    const id = await book(alice, show.showSeatIds.slice(0, 2));

    const res = await setSplit(alice, id, [
      { label: 'Me', amountMinor: 26_500 },
      { label: 'Priya', amountMinor: 26_500 },
    ]).expect(200);

    expect(res.body.shares).toHaveLength(2);
    expect(res.body.shares.map((s: { label: string }) => s.label)).toEqual(['Me', 'Priya']);
    expect(res.body.shares.every((s: { settled: boolean }) => s.settled === false)).toBe(true);
  });

  it('refuses a split that does not add up to the full total', async () => {
    const id = await book(alice, show.showSeatIds.slice(0, 2));

    const res = await setSplit(alice, id, [
      { label: 'Me', amountMinor: 20_000 },
      { label: 'Priya', amountMinor: 20_000 },
    ]).expect(400);

    expect(res.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
  });

  it('refuses to split a booking that has not been paid for', async () => {
    const hold = await request(app)
      .post(`/v1/showtimes/${show.showtimeId}/holds`)
      .set(alice.auth)
      .set('Idempotency-Key', idempotencyKey())
      .send({ showSeatIds: show.showSeatIds.slice(0, 2) })
      .expect(201);
    const checkout = await request(app)
      .post('/v1/checkout')
      .set(alice.auth)
      .set('Idempotency-Key', idempotencyKey())
      .send({ holdId: hold.body.id })
      .expect(201);

    // Not awaited to CONFIRMED: the booking is still PENDING.
    await setSplit(alice, checkout.body.bookingId, [{ label: 'Me', amountMinor: 53_000 }]).expect(
      409,
    );
  });

  it('toggles a share settled without touching the others', async () => {
    const id = await book(alice, show.showSeatIds.slice(0, 2));
    const created = await setSplit(alice, id, [
      { label: 'Me', amountMinor: 26_500 },
      { label: 'Priya', amountMinor: 26_500 },
    ]).expect(200);
    const [first, second] = created.body.shares as { id: string }[];

    const res = await request(app)
      .patch(`/v1/bookings/${id}/split/${first!.id}`)
      .set(alice.auth)
      .send({ settled: true })
      .expect(200);

    const byId = Object.fromEntries(
      (res.body.shares as { id: string; settled: boolean }[]).map((s) => [s.id, s.settled]),
    );
    expect(byId[first!.id]).toBe(true);
    expect(byId[second!.id]).toBe(false);
  });

  it('replaces the whole list on a second split, rather than appending', async () => {
    const id = await book(alice, show.showSeatIds.slice(0, 2));
    await setSplit(alice, id, [{ label: 'Me', amountMinor: 53_000 }]).expect(200);

    const res = await setSplit(alice, id, [
      { label: 'Me', amountMinor: 30_000 },
      { label: 'Priya', amountMinor: 23_000 },
    ]).expect(200);

    expect(res.body.shares).toHaveLength(2);
  });

  it("is private to the booking's owner", async () => {
    const id = await book(alice, show.showSeatIds.slice(0, 2));
    await setSplit(alice, id, [{ label: 'Me', amountMinor: 53_000 }]).expect(200);

    await getSplit(bob, id).expect(404);
    await setSplit(bob, id, [{ label: 'Bob', amountMinor: 53_000 }]).expect(404);
  });
});
