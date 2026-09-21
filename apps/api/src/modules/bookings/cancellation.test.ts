import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@app/shared';
import { createApp } from '../../app';
import { prisma } from '../../db';
import { verifyInvariants } from '../../scripts/verify-invariants';
import {
  createShowtime,
  createUser,
  idempotencyKey,
  resetDb,
  waitFor,
  type TestShowtime,
  type TestUser,
} from '../../test/helpers';

const app = createApp();

describe('cancellation', () => {
  let show: TestShowtime;
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    await resetDb();
    // Well outside the two-hour cancellation window. The helper's default of
    // exactly 120 minutes sits precisely on the deadline.
    show = await createShowtime({ seatCount: 10, priceMinor: 25_000, startsInMinutes: 600 });
    alice = await createUser('alice');
    bob = await createUser('bob');
  });

  /** Takes a booking all the way to CONFIRMED, the way the app does. */
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

  it('quotes the refund before anything is cancelled', async () => {
    const id = await book(alice, show.showSeatIds.slice(0, 2));

    const res = await request(app)
      .get(`/v1/bookings/${id}/cancellation`)
      .set(alice.auth)
      .expect(200);

    expect(res.body.cancellable).toBe(true);
    expect(res.body.refundMinor).toBe(50_000);
    expect(res.body.feeRetainedMinor).toBeGreaterThan(0);
    expect(res.body.reason).toBeNull();

    // Quoting must not have changed anything.
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id } });
    expect(booking.status).toBe('CONFIRMED');
  });

  it('refunds the seats, keeps the fee, and puts the seats back on sale', async () => {
    const seats = show.showSeatIds.slice(0, 2);
    const id = await book(alice, seats);

    const res = await request(app).post(`/v1/bookings/${id}/cancel`).set(alice.auth).expect(200);

    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.refundMinor).toBe(50_000);
    expect(res.body.releasedShowSeatIds.sort()).toEqual([...seats].sort());

    const released = await prisma.showSeat.findMany({
      where: { id: { in: seats } },
      select: { state: true, bookingId: true, holdId: true, holdExpiresAt: true },
    });
    // Released *and* clean: a seat still pointing at a dead hold would read as
    // available while failing the invariant that says it must not.
    for (const seat of released) {
      expect(seat.state).toBe('AVAILABLE');
      expect(seat.bookingId).toBeNull();
      expect(seat.holdId).toBeNull();
      expect(seat.holdExpiresAt).toBeNull();
    }

    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: id } });
    expect(payment.status).toBe('REFUNDED');
    expect(await verifyInvariants()).toEqual([]);
  });

  it('lets someone else book the released seats immediately', async () => {
    const seats = show.showSeatIds.slice(0, 2);
    const id = await book(alice, seats);
    await request(app).post(`/v1/bookings/${id}/cancel`).set(alice.auth).expect(200);

    await request(app)
      .post(`/v1/showtimes/${show.showtimeId}/holds`)
      .set(bob.auth)
      .set('Idempotency-Key', idempotencyKey())
      .send({ showSeatIds: seats })
      .expect(201);
  });

  it('refuses a second cancellation rather than refunding twice', async () => {
    const id = await book(alice, show.showSeatIds.slice(0, 2));
    await request(app).post(`/v1/bookings/${id}/cancel`).set(alice.auth).expect(200);

    const again = await request(app).post(`/v1/bookings/${id}/cancel`).set(alice.auth).expect(409);

    expect(again.body.error.code).toBe(ERROR_CODES.NOT_CANCELLABLE);

    const payments = await prisma.payment.findMany({ where: { bookingId: id } });
    expect(payments.filter((p) => p.status === 'REFUNDED')).toHaveLength(1);
  });

  it('pays out once when the same booking is cancelled concurrently', async () => {
    const id = await book(alice, show.showSeatIds.slice(0, 3));

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app).post(`/v1/bookings/${id}/cancel`).set(alice.auth),
      ),
    );

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await verifyInvariants()).toEqual([]);
  });

  it('will not let one user cancel another user’s booking', async () => {
    const id = await book(alice, show.showSeatIds.slice(0, 2));

    await request(app).post(`/v1/bookings/${id}/cancel`).set(bob.auth).expect(404);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id } });
    expect(booking.status).toBe('CONFIRMED');
  });

  it('closes cancellation near the screening', async () => {
    // Starts in 30 minutes, inside the two-hour cancellation window.
    const soon = await createShowtime({ seatCount: 6, startsInMinutes: 30 });
    const hold = await request(app)
      .post(`/v1/showtimes/${soon.showtimeId}/holds`)
      .set(alice.auth)
      .set('Idempotency-Key', idempotencyKey())
      .send({ showSeatIds: soon.showSeatIds.slice(0, 1) })
      .expect(201);
    const checkout = await request(app)
      .post('/v1/checkout')
      .set(alice.auth)
      .set('Idempotency-Key', idempotencyKey())
      .send({ holdId: hold.body.id })
      .expect(201);
    await waitFor(async () => {
      const b = await prisma.booking.findUnique({
        where: { id: checkout.body.bookingId },
        select: { status: true },
      });
      return b?.status === 'CONFIRMED';
    });

    const quote = await request(app)
      .get(`/v1/bookings/${checkout.body.bookingId}/cancellation`)
      .set(alice.auth)
      .expect(200);
    expect(quote.body.cancellable).toBe(false);
    expect(quote.body.reason).toMatch(/two hours/i);

    const res = await request(app)
      .post(`/v1/bookings/${checkout.body.bookingId}/cancel`)
      .set(alice.auth)
      .expect(409);
    expect(res.body.error.code).toBe(ERROR_CODES.CANCELLATION_CLOSED);
  });
});
