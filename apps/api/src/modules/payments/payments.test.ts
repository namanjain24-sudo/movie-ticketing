import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@app/shared';
import { createApp } from '../../app';
import { prisma } from '../../db';
import { sweepOnce } from '../../jobs/sweeper';
import { verifyInvariants } from '../../scripts/verify-invariants';
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
import { gateway, mockGatewayControls, resetMockGateway } from './gateway';
import { __testing, reconcilePendingPayments } from './payments.service';

/**
 * Payment behaviour under the conditions that actually cost money: retries,
 * duplicate callbacks, callbacks that arrive in the wrong order, callbacks
 * that never arrive, and a capture that lands after the seats were already
 * given back.
 */

let server: Server;

beforeAll(() => {
  server = createApp().listen(0);
});

afterAll(() => {
  server.close();
});

describe('checkout and payment', () => {
  let show: TestShowtime;
  let user: TestUser;

  beforeEach(async () => {
    await resetDb();
    resetMockGateway();
    mockGatewayControls.forceOutcome = 'SUCCESS';
    show = await createShowtime({ seatCount: 8, priceMinor: 30_000 });
    user = await createUser('payer');
  });

  async function takeHold(seatCount = 2) {
    const res = await request(server)
      .post(`/v1/showtimes/${show.showtimeId}/holds`)
      .set(user.auth)
      .set('Idempotency-Key', idempotencyKey('hold'))
      .send({ showSeatIds: show.showSeatIds.slice(0, seatCount) })
      .expect(201);
    return res.body as { id: string; totalMinor: number; seats: unknown[] };
  }

  function checkout(holdId: string, key = idempotencyKey('pay')) {
    return request(server)
      .post('/v1/checkout')
      .set(user.auth)
      .set('Idempotency-Key', key)
      .send({ holdId, method: 'CARD' });
  }

  async function bookingStatus(bookingId: string) {
    const row = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: { status: true },
    });
    return row.status;
  }

  it('confirms the booking only once the gateway says the money moved', async () => {
    const hold = await takeHold(2);
    const res = await checkout(hold.id).expect(201);

    // At this instant the seats are paid for but not yet confirmed, which is
    // the whole point of waiting for the callback.
    expect(res.body.status).toBe('PENDING');
    expect(await bookingStatus(res.body.bookingId)).toBe('PENDING');

    await waitFor(async () => (await bookingStatus(res.body.bookingId)) === 'CONFIRMED');

    const seats = await prisma.showSeat.findMany({
      where: { bookingId: res.body.bookingId },
      select: { state: true, holdExpiresAt: true },
    });
    expect(seats).toHaveLength(2);
    for (const seat of seats) {
      expect(seat.state).toBe('CONFIRMED');
      // A confirmed seat has no expiry left to run.
      expect(seat.holdExpiresAt).toBeNull();
    }
    expect(await verifyInvariants()).toEqual([]);
  });

  it('charges once when the gateway delivers every callback twice', async () => {
    mockGatewayControls.duplicateWebhooks = true;

    const hold = await takeHold(2);
    const res = await checkout(hold.id).expect(201);
    await waitFor(async () => (await bookingStatus(res.body.bookingId)) === 'CONFIRMED');

    // Deduplication is the insert on the gateway's own event id, so a second
    // delivery never reaches the handler.
    const captured = await prisma.payment.count({
      where: { bookingId: res.body.bookingId, status: 'CAPTURED' },
    });
    expect(captured).toBe(1);
    expect(await verifyInvariants()).toEqual([]);
  });

  it('reaches the same state when the capture arrives before the authorisation', async () => {
    mockGatewayControls.outOfOrderWebhooks = true;

    const hold = await takeHold(2);
    const res = await checkout(hold.id).expect(201);
    await waitFor(async () => (await bookingStatus(res.body.bookingId)) === 'CONFIRMED');

    const payment = await prisma.payment.findFirstOrThrow({
      where: { bookingId: res.body.bookingId },
    });
    // The late authorisation must not walk a captured payment backwards.
    expect(payment.status).toBe('CAPTURED');
    expect(await verifyInvariants()).toEqual([]);
  });

  it('keeps the hold alive after a decline so the user can retry in place', async () => {
    mockGatewayControls.forceOutcome = 'FAILURE';

    const hold = await takeHold(2);
    const first = await checkout(hold.id).expect(201);

    await waitFor(async () => {
      const p = await prisma.payment.findFirstOrThrow({
        where: { bookingId: first.body.bookingId },
        orderBy: { createdAt: 'desc' },
      });
      return p.status === 'FAILED';
    });

    // The booking survives the failed attempt, and so do the seats.
    expect(await bookingStatus(first.body.bookingId)).toBe('PENDING');
    const hold2 = await prisma.hold.findUniqueOrThrow({ where: { id: hold.id } });
    expect(hold2.status).toBe('ACTIVE');

    // Retrying with a new key opens a second attempt on the same booking.
    mockGatewayControls.forceOutcome = 'SUCCESS';
    const second = await checkout(hold.id).expect(201);
    expect(second.body.bookingId).toBe(first.body.bookingId);

    await waitFor(async () => (await bookingStatus(first.body.bookingId)) === 'CONFIRMED');

    const payments = await prisma.payment.findMany({
      where: { bookingId: first.body.bookingId },
      select: { status: true },
    });
    expect(payments).toHaveLength(2);
    expect(payments.filter((p) => p.status === 'CAPTURED')).toHaveLength(1);
    expect(await verifyInvariants()).toEqual([]);
  });

  it('replays a retried checkout instead of opening a second charge', async () => {
    const hold = await takeHold(2);
    const key = idempotencyKey('replay');

    const first = await checkout(hold.id, key).expect(201);
    const second = await checkout(hold.id, key).expect(201);

    expect(second.body.paymentId).toBe(first.body.paymentId);
    expect(second.headers['idempotent-replay']).toBe('true');
    expect(await prisma.payment.count()).toBe(1);
  });

  it('refuses a webhook whose signature does not verify', async () => {
    const body = JSON.stringify({
      id: 'evt_forged',
      type: 'payment.captured',
      providerRef: 'pay_whatever',
      amountMinor: 1,
      currency: 'INR',
    });
    await request(server)
      .post('/v1/payments/webhook')
      .set('x-webhook-signature', 'deadbeef')
      .set('content-type', 'application/json')
      .send(body)
      .expect(400);

    expect(await prisma.webhookEvent.count()).toBe(0);
  });

  it('refunds rather than oversells when the capture lands after the hold expired', async () => {
    // The callback is withheld so the hold can be run out first.
    mockGatewayControls.dropWebhooks = true;

    const hold = await takeHold(2);
    const key = idempotencyKey('late');
    const res = await checkout(hold.id, key).expect(201);

    await expireHold(hold.id);
    await sweepOnce(); // seats are back on sale

    // Now the gateway finally reports the capture.
    const event = {
      id: `evt_late_${res.body.paymentId}`,
      type: 'payment.captured' as const,
      providerRef: __testing.providerRefFor(key),
      amountMinor: res.body.amountMinor,
      currency: res.body.currency,
    };
    const raw = Buffer.from(JSON.stringify(event));
    await request(server)
      .post('/v1/payments/webhook')
      .set('x-webhook-signature', gateway.signWebhook(raw))
      .set('content-type', 'application/json')
      .send(raw.toString())
      .expect(200);

    // Confirming would have sold seats that are already available again.
    expect(await bookingStatus(res.body.bookingId)).toBe('FAILED');
    const payment = await prisma.payment.findFirstOrThrow({
      where: { bookingId: res.body.bookingId },
    });
    expect(payment.status).toBe('REFUNDED');
    expect(payment.failureReason).toMatch(/expired/i);

    expect(
      await prisma.showSeat.count({ where: { showtimeId: show.showtimeId, state: 'CONFIRMED' } }),
    ).toBe(0);
    expect(await verifyInvariants()).toEqual([]);
  });

  it('resolves a payment whose callback never arrives', async () => {
    mockGatewayControls.dropWebhooks = true;

    const hold = await takeHold(2);
    const key = idempotencyKey('dropped');
    const res = await checkout(hold.id, key).expect(201);

    // The gateway settled; only the notification was lost.
    await waitFor(async () => {
      const intent = await gateway.fetchIntent(__testing.providerRefFor(key));
      return intent?.status === 'CAPTURED';
    });
    expect(await bookingStatus(res.body.bookingId)).toBe('PENDING');

    // Reconciliation asks the gateway rather than guessing from local state.
    const result = await reconcilePendingPayments({ olderThanMs: 0 });

    expect(result.confirmed).toBe(1);
    expect(await bookingStatus(res.body.bookingId)).toBe('CONFIRMED');
    expect(await verifyInvariants()).toEqual([]);
  });

  it('reports an in-flight payment so the client can stop guessing', async () => {
    mockGatewayControls.dropWebhooks = true;
    const hold = await takeHold(1);
    const res = await checkout(hold.id).expect(201);

    const status = await request(server)
      .get(`/v1/payments/${res.body.paymentId}`)
      .set(user.auth)
      .expect(200);

    expect(status.body.status).toBe('PENDING');
    expect(status.body.bookingStatus).toBe('PENDING');
    expect(status.body.reference).toBeNull();
  });

  it('refuses checkout on an expired hold', async () => {
    const hold = await takeHold(2);
    await expireHold(hold.id);

    const res = await checkout(hold.id).expect(410);
    expect(res.body.error.code).toBe(ERROR_CODES.HOLD_EXPIRED);
  });

  it('puts the confirmed ticket on the user’s list with a signed QR', async () => {
    const hold = await takeHold(3);
    const res = await checkout(hold.id).expect(201);
    await waitFor(async () => (await bookingStatus(res.body.bookingId)) === 'CONFIRMED');

    const list = await request(server).get('/v1/bookings').set(user.auth).expect(200);
    expect(list.body.upcoming).toHaveLength(1);

    const ticket = list.body.upcoming[0];
    expect(ticket.reference).toMatch(/^BK-[0-9A-HJ-NP-TV-Z]{6}$/);
    expect(ticket.seats).toHaveLength(3);
    expect(ticket.qrPayload.split('|')).toHaveLength(4);

    const byRef = await request(server)
      .get(`/v1/bookings/reference/${ticket.reference}`)
      .set(user.auth)
      .expect(200);
    expect(byRef.body.id).toBe(ticket.id);
  });
});
