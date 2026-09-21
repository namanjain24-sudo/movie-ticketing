import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@app/shared';
import { createApp } from '../../app';
import { prisma } from '../../db';
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
import { mockGatewayControls, resetMockGateway } from '../payments/gateway';
import { computeDiscount, normaliseCode, refundableMinor } from './promos.service';

const app = createApp();

describe('computeDiscount', () => {
  const percent = (value: number, maxDiscountMinor: number | null = null) =>
    ({ kind: 'PERCENT', value, maxDiscountMinor }) as const;
  const flat = (value: number) => ({ kind: 'FLAT', value, maxDiscountMinor: null }) as const;

  it('takes a percentage of the seats and rounds down', () => {
    expect(computeDiscount(percent(20), 50_000, 3_000)).toBe(10_000);
    // 15% of 333 is 49.95; a discount is never rounded in the customer's favour.
    expect(computeDiscount(percent(15), 333, 3_000)).toBe(49);
  });

  it('respects the ceiling on a percentage code', () => {
    expect(computeDiscount(percent(50, 15_000), 200_000, 3_000)).toBe(15_000);
  });

  it('gives a flat amount', () => {
    expect(computeDiscount(flat(5_000), 50_000, 3_000)).toBe(5_000);
  });

  it('never exceeds the seat subtotal, so the fee is always still owed', () => {
    expect(computeDiscount(flat(99_999), 20_000, 3_000)).toBe(20_000);
    expect(computeDiscount(percent(100), 20_000, 3_000)).toBe(20_000);
  });

  it('always leaves at least one minor unit to charge', () => {
    // No fee, and a code worth more than the seats: the total must not reach zero.
    expect(computeDiscount(flat(99_999), 20_000, 0)).toBe(19_999);
  });

  it('is never negative', () => {
    expect(computeDiscount(flat(-5), 20_000, 3_000)).toBe(0);
  });
});

describe('helpers', () => {
  it('normalises what a person types', () => {
    expect(normaliseCode('  welcome50 ')).toBe('WELCOME50');
  });

  it('refunds the seats paid for, not the seats listed', () => {
    expect(refundableMinor({ subtotalMinor: 50_000, discountMinor: 10_000 })).toBe(40_000);
    expect(refundableMinor({ subtotalMinor: 50_000, discountMinor: 0 })).toBe(50_000);
    expect(refundableMinor({ subtotalMinor: 100, discountMinor: 500 })).toBe(0);
  });
});

describe('promo codes', () => {
  let show: TestShowtime;
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    await resetDb();
    resetMockGateway();
    mockGatewayControls.forceOutcome = 'SUCCESS';
    // Far from the cancellation window, and 30_000 a seat so two seats clear
    // the minimum-spend thresholds used below.
    show = await createShowtime({ seatCount: 12, priceMinor: 30_000, startsInMinutes: 600 });
    alice = await createUser('alice');
    bob = await createUser('bob');
  });

  const promo = (overrides: Record<string, unknown> = {}) =>
    prisma.promoCode.create({
      data: {
        code: 'SAVE100',
        description: '₹100 off',
        kind: 'FLAT',
        value: 10_000,
        ...overrides,
      } as never,
    });

  async function hold(user: TestUser, seatIndexes: number[]) {
    const res = await request(app)
      .post(`/v1/showtimes/${show.showtimeId}/holds`)
      .set(user.auth)
      .set('Idempotency-Key', idempotencyKey('hold'))
      .send({ showSeatIds: seatIndexes.map((i) => show.showSeatIds[i]) })
      .expect(201);
    return res.body as { id: string; subtotalMinor: number; totalMinor: number };
  }

  const validate = (user: TestUser, holdId: string, code: string) =>
    request(app).post('/v1/promos/validate').set(user.auth).send({ holdId, code });

  const checkout = (user: TestUser, holdId: string, promoCode?: string) =>
    request(app)
      .post('/v1/checkout')
      .set(user.auth)
      .set('Idempotency-Key', idempotencyKey('pay'))
      .send({ holdId, method: 'CARD', ...(promoCode ? { promoCode } : {}) });

  async function settled(bookingId: string) {
    await waitFor(async () => {
      const b = await prisma.booking.findUnique({ where: { id: bookingId } });
      return b?.status === 'CONFIRMED';
    });
  }

  describe('offers', () => {
    it('lists codes anyone could use right now, without signing in', async () => {
      await promo({ code: 'LIVE' });
      await promo({ code: 'OFF', active: false });
      await promo({ code: 'OLD', expiresAt: new Date(Date.now() - 60_000) });
      await promo({ code: 'SOON', startsAt: new Date(Date.now() + 3_600_000) });

      const res = await request(app).get('/v1/promos').expect(200);
      expect(res.body.offers.map((o: { code: string }) => o.code)).toEqual(['LIVE']);
    });

    it('stops advertising a code once it is fully redeemed', async () => {
      await promo({ code: 'ONCE', usageLimit: 1 });
      const h = await hold(alice, [0, 1]);
      await checkout(alice, h.id, 'ONCE').expect(201);

      const res = await request(app).get('/v1/promos').expect(200);
      expect(res.body.offers).toEqual([]);
    });
  });

  describe('validating against a hold', () => {
    it('quotes the saving without changing anything', async () => {
      await promo();
      const h = await hold(alice, [0, 1]);

      const res = await validate(alice, h.id, 'SAVE100').expect(200);
      expect(res.body).toMatchObject({
        code: 'SAVE100',
        subtotalMinor: 60_000,
        discountMinor: 10_000,
        currency: 'INR',
      });
      expect(res.body.totalMinor).toBe(h.totalMinor - 10_000);
      expect(await prisma.booking.count()).toBe(0);
    });

    it('does not care about case or stray spaces', async () => {
      await promo();
      const h = await hold(alice, [0, 1]);
      const res = await validate(alice, h.id, '  save100 ').expect(200);
      expect(res.body.code).toBe('SAVE100');
    });

    it.each([
      ['NOT_FOUND', 'NOPE', {}],
      ['INACTIVE', 'SAVE100', { active: false }],
      ['EXPIRED', 'SAVE100', { expiresAt: new Date(Date.now() - 1000) }],
      ['NOT_STARTED', 'SAVE100', { startsAt: new Date(Date.now() + 3_600_000) }],
      ['MIN_SPEND', 'SAVE100', { minSubtotalMinor: 500_000 }],
    ])('refuses with %s', async (reason, code, overrides) => {
      if (reason !== 'NOT_FOUND') await promo(overrides);
      const h = await hold(alice, [0, 1]);

      const res = await validate(alice, h.id, code).expect(422);
      expect(res.body.error.code).toBe(ERROR_CODES.PROMO_INVALID);
      expect(res.body.error.details.reason).toEqual([reason]);
    });

    it('refuses a code the user has already used up', async () => {
      await promo();
      const first = await hold(alice, [0, 1]);
      await checkout(alice, first.id, 'SAVE100').expect(201);

      const second = await hold(alice, [2, 3]);
      const res = await validate(alice, second.id, 'SAVE100').expect(422);
      expect(res.body.error.details.reason).toEqual(['ALREADY_USED']);
    });

    it('refuses a code that everyone together has used up', async () => {
      await promo({ usageLimit: 1 });
      const first = await hold(alice, [0, 1]);
      await checkout(alice, first.id, 'SAVE100').expect(201);

      const other = await hold(bob, [2, 3]);
      const res = await validate(bob, other.id, 'SAVE100').expect(422);
      expect(res.body.error.details.reason).toEqual(['USED_UP']);
    });

    it('needs a signed-in user, and a hold that is theirs', async () => {
      await promo();
      const h = await hold(alice, [0, 1]);

      await request(app)
        .post('/v1/promos/validate')
        .send({ holdId: h.id, code: 'SAVE100' })
        .expect(401);
      await validate(bob, h.id, 'SAVE100').expect(404);
    });

    it('refuses once the hold has run out', async () => {
      await promo();
      const h = await hold(alice, [0, 1]);
      await expireHold(h.id);
      await validate(alice, h.id, 'SAVE100').expect(410);
    });
  });

  describe('at checkout', () => {
    it('charges the discounted total and records why', async () => {
      await promo();
      const h = await hold(alice, [0, 1]);

      const res = await checkout(alice, h.id, 'save100').expect(201);
      expect(res.body.amountMinor).toBe(h.totalMinor - 10_000);
      await settled(res.body.bookingId);

      const booking = await prisma.booking.findUniqueOrThrow({
        where: { id: res.body.bookingId },
        include: { promoCode: true, payments: true },
      });
      expect(booking.discountMinor).toBe(10_000);
      expect(booking.promoCode?.code).toBe('SAVE100');
      expect(booking.totalMinor).toBe(booking.subtotalMinor + booking.feeMinor - 10_000);
      expect(booking.payments[0]?.amountMinor).toBe(booking.totalMinor);
      expect(await verifyInvariants()).toEqual([]);
    });

    it('shows the discount on the booking the app reads back', async () => {
      await promo();
      const h = await hold(alice, [0, 1]);
      const paid = await checkout(alice, h.id, 'SAVE100').expect(201);
      await settled(paid.body.bookingId);

      const res = await request(app)
        .get(`/v1/bookings/reference/${paid.body.reference}`)
        .set(alice.auth)
        .expect(200);
      expect(res.body).toMatchObject({ discountMinor: 10_000, promoCode: 'SAVE100' });
    });

    it('charges full price when no code is sent', async () => {
      await promo();
      const h = await hold(alice, [0, 1]);
      const res = await checkout(alice, h.id).expect(201);
      expect(res.body.amountMinor).toBe(h.totalMinor);

      const booking = await prisma.booking.findUniqueOrThrow({
        where: { id: res.body.bookingId },
      });
      expect(booking.discountMinor).toBe(0);
      expect(booking.promoCodeId).toBeNull();
    });

    it('rejects a bad code outright rather than quietly charging full price', async () => {
      const h = await hold(alice, [0, 1]);
      const res = await checkout(alice, h.id, 'NOPE').expect(422);
      expect(res.body.error.details.reason).toEqual(['NOT_FOUND']);
      // Nothing was created, so the user can fix the code and try again.
      expect(await prisma.booking.count()).toBe(0);
    });

    it('keeps the quoted price when a payment is retried, whatever the retry says', async () => {
      await promo();
      mockGatewayControls.forceOutcome = 'FAILURE';
      const h = await hold(alice, [0, 1]);
      const first = await checkout(alice, h.id, 'SAVE100').expect(201);
      await waitFor(async () => {
        const p = await prisma.payment.findFirstOrThrow({
          where: { bookingId: first.body.bookingId },
        });
        return p.status === 'FAILED';
      });

      // The retry names no code at all. It still pays what it was quoted.
      mockGatewayControls.forceOutcome = 'SUCCESS';
      const retry = await checkout(alice, h.id).expect(201);

      expect(retry.body.bookingId).toBe(first.body.bookingId);
      expect(retry.body.amountMinor).toBe(first.body.amountMinor);
      expect(retry.body.amountMinor).toBe(h.totalMinor - 10_000);
      await settled(first.body.bookingId);
      expect(await verifyInvariants()).toEqual([]);
    });

    it('never discounts the booking fee, even with a code worth more than the seats', async () => {
      await promo({ value: 9_999_999 });
      const h = await hold(alice, [0, 1]);
      const res = await checkout(alice, h.id, 'SAVE100').expect(201);

      const booking = await prisma.booking.findUniqueOrThrow({
        where: { id: res.body.bookingId },
      });
      expect(booking.discountMinor).toBe(booking.subtotalMinor);
      expect(booking.totalMinor).toBe(booking.feeMinor);
      expect(booking.totalMinor).toBeGreaterThan(0);
    });
  });

  describe('limits under concurrency', () => {
    it('lets exactly usageLimit people win a race for the last uses', async () => {
      await promo({ usageLimit: 2 });
      const users = await Promise.all(['u1', 'u2', 'u3', 'u4', 'u5'].map((n) => createUser(n)));
      const holds: { id: string }[] = [];
      for (const [i, u] of users.entries()) holds.push(await hold(u, [i * 2, i * 2 + 1]));

      const results = await Promise.all(users.map((u, i) => checkout(u, holds[i]!.id, 'SAVE100')));

      const won = results.filter((r) => r.status === 201);
      const lost = results.filter((r) => r.status === 422);
      expect(won).toHaveLength(2);
      expect(lost).toHaveLength(3);
      for (const r of lost) expect(r.body.error.details.reason).toEqual(['USED_UP']);
      expect(await verifyInvariants()).toEqual([]);
    });

    it('lets one person use a once-only code on only one of two simultaneous checkouts', async () => {
      await promo();
      const a = await hold(alice, [0, 1]);
      const b = await hold(alice, [2, 3]);

      const results = await Promise.all([
        checkout(alice, a.id, 'SAVE100'),
        checkout(alice, b.id, 'SAVE100'),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
      expect(await verifyInvariants()).toEqual([]);
    });
  });

  describe('giving a use back', () => {
    it('frees the use when the checkout is abandoned and the hold lapses', async () => {
      await promo({ usageLimit: 1 });
      const abandoned = await hold(alice, [0, 1]);
      await checkout(alice, abandoned.id, 'SAVE100').expect(201);
      await expireHold(abandoned.id);

      const next = await hold(bob, [4, 5]);
      await checkout(bob, next.id, 'SAVE100').expect(201);
    });

    it('frees the use when a confirmed booking is cancelled', async () => {
      await promo({ usageLimit: 1 });
      const h = await hold(alice, [0, 1]);
      const paid = await checkout(alice, h.id, 'SAVE100').expect(201);
      await settled(paid.body.bookingId);
      await request(app)
        .post(`/v1/bookings/${paid.body.bookingId}/cancel`)
        .set(alice.auth)
        .expect(200);

      const next = await hold(bob, [4, 5]);
      await checkout(bob, next.id, 'SAVE100').expect(201);
      expect(await verifyInvariants()).toEqual([]);
    });
  });

  describe('cancellation', () => {
    it('refunds what was paid for the seats, not their list price', async () => {
      await promo();
      const h = await hold(alice, [0, 1]);
      const paid = await checkout(alice, h.id, 'SAVE100').expect(201);
      await settled(paid.body.bookingId);

      const quote = await request(app)
        .get(`/v1/bookings/${paid.body.bookingId}/cancellation`)
        .set(alice.auth)
        .expect(200);
      expect(quote.body.refundMinor).toBe(50_000);

      const res = await request(app)
        .post(`/v1/bookings/${paid.body.bookingId}/cancel`)
        .set(alice.auth)
        .expect(200);
      expect(res.body.refundMinor).toBe(50_000);
      expect(await verifyInvariants()).toEqual([]);
    });
  });
});
