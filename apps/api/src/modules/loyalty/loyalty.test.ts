import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
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
import { mockGatewayControls, resetMockGateway } from '../payments/gateway';
import { computeRedemptionDiscount, earnedPoints } from './loyalty.service';

const app = createApp();

describe('earnedPoints', () => {
  it('is one point per ₹100 spent, rounded down', () => {
    expect(earnedPoints(63_000)).toBe(6);
    expect(earnedPoints(9_999)).toBe(0);
    expect(earnedPoints(0)).toBe(0);
  });
});

describe('computeRedemptionDiscount', () => {
  it('is a flat ₹1 per point', () => {
    expect(computeRedemptionDiscount(6, 60_000, 3_000)).toBe(600);
  });

  it('never exceeds the seat subtotal', () => {
    expect(computeRedemptionDiscount(1_000, 60_000, 3_000)).toBe(60_000);
  });

  it('always leaves at least one minor unit to charge', () => {
    expect(computeRedemptionDiscount(1_000, 60_000, 0)).toBe(59_999);
  });
});

describe('loyalty points', () => {
  let show: TestShowtime;
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    await resetDb();
    resetMockGateway();
    mockGatewayControls.forceOutcome = 'SUCCESS';
    // 30_000 a seat, two seats: 60_000 subtotal, 63_000 total at the default
    // 3_000 fee — 6 points earned, a round number to assert against.
    show = await createShowtime({ seatCount: 12, priceMinor: 30_000, startsInMinutes: 600 });
    alice = await createUser('alice');
    bob = await createUser('bob');
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

  const quote = (user: TestUser, holdId: string, points: number) =>
    request(app).post('/v1/loyalty/quote').set(user.auth).send({ holdId, points });

  const checkout = (
    user: TestUser,
    holdId: string,
    body: { promoCode?: string; pointsToRedeem?: number } = {},
  ) =>
    request(app)
      .post('/v1/checkout')
      .set(user.auth)
      .set('Idempotency-Key', idempotencyKey('pay'))
      .send({ holdId, method: 'CARD', ...body });

  const balance = async (user: TestUser) =>
    (
      await request(app)
        .get('/v1/loyalty/balance')
        .set(user.auth)
        .expect(200)
        .then((r) => r.body)
    ).balance as number;

  const lifetime = async (user: TestUser) =>
    (
      await request(app)
        .get('/v1/loyalty/balance')
        .set(user.auth)
        .expect(200)
        .then((r) => r.body)
    ).lifetimePoints as number;

  async function settled(bookingId: string) {
    await waitFor(async () => {
      const b = await prisma.booking.findUnique({ where: { id: bookingId } });
      return b?.status === 'CONFIRMED';
    });
  }

  it('starts at zero for a new user', async () => {
    expect(await balance(alice)).toBe(0);
  });

  it('earns points once a booking is confirmed, not before', async () => {
    const h = await hold(alice, [0, 1]);
    const paid = await checkout(alice, h.id).expect(201);

    expect(await balance(alice)).toBe(0); // Not yet confirmed.
    await settled(paid.body.bookingId);
    expect(await balance(alice)).toBe(6);

    const booking = await request(app)
      .get(`/v1/bookings/${paid.body.bookingId}`)
      .set(alice.auth)
      .expect(200);
    expect(booking.body.pointsEarned).toBe(6);
  });

  it('quotes and then spends points, folded into the discount', async () => {
    const first = await hold(alice, [0, 1]);
    await settled((await checkout(alice, first.id).expect(201)).body.bookingId);
    expect(await balance(alice)).toBe(6);

    const second = await hold(alice, [2, 3]);
    const q = await quote(alice, second.id, 6).expect(200);
    expect(q.body).toMatchObject({
      points: 6,
      subtotalMinor: 60_000,
      discountMinor: 600,
      totalMinor: second.totalMinor - 600,
    });

    const paid = await checkout(alice, second.id, { pointsToRedeem: 6 }).expect(201);
    expect(paid.body.amountMinor).toBe(second.totalMinor - 600);
    expect(await balance(alice)).toBe(0); // Spent, not yet re-earned.

    const booking = await request(app)
      .get(`/v1/bookings/${paid.body.bookingId}`)
      .set(alice.auth)
      .expect(200);
    expect(booking.body.pointsRedeemed).toBe(6);
    expect(booking.body.discountMinor).toBe(600);

    await settled(paid.body.bookingId);
    // 62_400 total this time (63_000 - 600 discount), 6 points again.
    expect(await balance(alice)).toBe(6);
    expect(await verifyInvariants()).toEqual([]);
  });

  it('combines with a promo code in the same checkout', async () => {
    await prisma.promoCode.create({
      data: { code: 'SAVE100', description: '₹100 off', kind: 'FLAT', value: 10_000 } as never,
    });
    const first = await hold(alice, [0, 1]);
    await settled((await checkout(alice, first.id).expect(201)).body.bookingId);

    const second = await hold(alice, [2, 3]);
    const paid = await checkout(alice, second.id, {
      promoCode: 'SAVE100',
      pointsToRedeem: 6,
    }).expect(201);

    const booking = await request(app)
      .get(`/v1/bookings/${paid.body.bookingId}`)
      .set(alice.auth)
      .expect(200);
    // 10_000 (promo) + 600 (points), off a 60_000 subtotal.
    expect(booking.body.discountMinor).toBe(10_600);
    expect(booking.body.pointsRedeemed).toBe(6);
  });

  it('refuses to spend more points than the user has', async () => {
    const h = await hold(bob, [0, 1]);
    const res = await quote(bob, h.id, 1).expect(422);
    expect(res.body.error.code).toBe(ERROR_CODES.LOYALTY_INVALID);
    expect(res.body.error.details.reason).toEqual(['INSUFFICIENT_BALANCE']);
  });

  it('refuses a redemption worth more than the seats cost', async () => {
    const first = await hold(alice, [0, 1]);
    await settled((await checkout(alice, first.id).expect(201)).body.bookingId);

    // Seed a balance large enough that 700 points (₹700) exceeds a
    // 60_000-minor (₹600) subtotal.
    await prisma.loyaltyLedger.create({
      data: { userId: alice.id, points: 700, reason: 'EARNED' },
    });

    const second = await hold(alice, [2, 3]);
    const res = await quote(alice, second.id, 700).expect(422);
    expect(res.body.error.details.reason).toEqual(['EXCEEDS_SUBTOTAL']);
  });

  it('hands redeemed points back when an abandoned checkout is swept', async () => {
    const first = await hold(alice, [0, 1]);
    await settled((await checkout(alice, first.id).expect(201)).body.bookingId);
    expect(await balance(alice)).toBe(6);

    // A genuinely abandoned checkout: the gateway callback never arrives at
    // all, not just late — the same case `dropWebhooks` exists for.
    mockGatewayControls.dropWebhooks = true;
    const second = await hold(alice, [2, 3]);
    await checkout(alice, second.id, { pointsToRedeem: 6 }).expect(201);
    expect(await balance(alice)).toBe(0);

    await expireHold(second.id);
    await sweepOnce();

    expect(await balance(alice)).toBe(6);
    expect(await verifyInvariants()).toEqual([]);
  });

  it('claws back both earned and redeemed points when a confirmed booking is cancelled', async () => {
    const first = await hold(alice, [0, 1]);
    const firstPaid = await checkout(alice, first.id).expect(201);
    await settled(firstPaid.body.bookingId);
    expect(await balance(alice)).toBe(6);

    const second = await hold(alice, [2, 3]);
    const secondPaid = await checkout(alice, second.id, { pointsToRedeem: 6 }).expect(201);
    await settled(secondPaid.body.bookingId);
    // Spent 6, earned 6 back on the discounted total: balance is 6 again.
    expect(await balance(alice)).toBe(6);

    await request(app)
      .post(`/v1/bookings/${secondPaid.body.bookingId}/cancel`)
      .set(alice.auth)
      .expect(200);

    // The 6 earned on the now-cancelled booking are clawed back, and the 6
    // spent on it are handed back — net back to the 6 from the first booking.
    expect(await balance(alice)).toBe(6);
    expect(await verifyInvariants()).toEqual([]);
  });

  describe('lifetime points, which tiers rank on', () => {
    it('starts at zero and follows what was earned', async () => {
      expect(await lifetime(alice)).toBe(0);
      const h = await hold(alice, [0, 1]);
      const paid = await checkout(alice, h.id).expect(201);
      await settled(paid.body.bookingId);
      expect(await lifetime(alice)).toBe(6);
    });

    it('does not fall when points are spent', async () => {
      const first = await hold(alice, [0, 1]);
      const firstPaid = await checkout(alice, first.id).expect(201);
      await settled(firstPaid.body.bookingId);

      const second = await hold(alice, [2, 3]);
      const secondPaid = await checkout(alice, second.id, { pointsToRedeem: 6 }).expect(201);
      await settled(secondPaid.body.bookingId);

      // Balance went down and came back; lifetime only ever went up. Spending
      // is what the programme is for, so it must not cost a tier.
      expect(await balance(alice)).toBe(6);
      expect(await lifetime(alice)).toBe(12);
    });

    it('falls by the clawback when a booking is cancelled, and not by the refund', async () => {
      const first = await hold(alice, [0, 1]);
      const firstPaid = await checkout(alice, first.id).expect(201);
      await settled(firstPaid.body.bookingId);

      const second = await hold(alice, [2, 3]);
      const secondPaid = await checkout(alice, second.id, { pointsToRedeem: 6 }).expect(201);
      await settled(secondPaid.body.bookingId);
      expect(await lifetime(alice)).toBe(12);

      await request(app)
        .post(`/v1/bookings/${secondPaid.body.bookingId}/cancel`)
        .set(alice.auth)
        .expect(200);

      // Cancelling writes two REVERSED rows: -6 clawing back the award, and
      // +6 handing back the spend. Only the first is an un-earning. Summing
      // REVERSED blind would leave lifetime at 12 and hand out a tier nobody
      // reached.
      expect(await lifetime(alice)).toBe(6);
      expect(await balance(alice)).toBe(6);
      expect(await verifyInvariants()).toEqual([]);
    });
  });
});
