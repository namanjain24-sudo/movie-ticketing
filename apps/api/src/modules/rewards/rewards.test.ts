import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { SCRATCH_PRIZES } from '@app/shared';
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
import { pickPrize } from './rewards.service';

const app = createApp();

/**
 * The first element, or a failed test.
 *
 * `noUncheckedIndexedAccess` is on, which is right, and it means every
 * `list[0]` in a test is a possibly-undefined. Asserting it here once keeps
 * the assertions below about scratch cards rather than about optionality.
 */
function firstOf<T>(items: T[], what = 'item'): T {
  const [item] = items;
  if (item === undefined) throw new Error(`expected at least one ${what}`);
  return item;
}

const FIRST_PRIZE = firstOf([...SCRATCH_PRIZES], 'prize');
const LAST_PRIZE = firstOf([...SCRATCH_PRIZES].reverse(), 'prize');

describe('pickPrize', () => {
  const total = SCRATCH_PRIZES.reduce((sum, p) => sum + p.weight, 0);

  it('returns the first prize at the bottom of the range', () => {
    expect(pickPrize(0)).toBe(FIRST_PRIZE.points);
  });

  it('returns the last prize at the top of the range', () => {
    expect(pickPrize(0.999999999)).toBe(LAST_PRIZE.points);
  });

  it('does not fall off the end when the roll reaches one', () => {
    // `Math.random()` never returns 1, but a caller passing it should not be
    // silently handed the common prize instead of the rare one.
    expect(pickPrize(1)).toBe(LAST_PRIZE.points);
  });

  it('never answers with a prize that is not in the table', () => {
    const allowed = new Set<number>(SCRATCH_PRIZES.map((p) => p.points));
    for (let i = 0; i < 2_000; i += 1) {
      expect(allowed.has(pickPrize())).toBe(true);
    }
  });

  it('lands each prize in its own share of the range', () => {
    // Walked deterministically rather than sampled: the boundaries are the
    // thing worth asserting, and a random sample makes a flaky test out of
    // arithmetic that is not random at all.
    let cursor = 0;
    for (const prize of SCRATCH_PRIZES) {
      const justInside = (cursor + 0.5) / total;
      const justBelowEnd = (cursor + prize.weight - 0.001) / total;
      expect(pickPrize(justInside)).toBe(prize.points);
      expect(pickPrize(justBelowEnd)).toBe(prize.points);
      cursor += prize.weight;
    }
  });
});

describe('scratch cards', () => {
  let show: TestShowtime;
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    await resetDb();
    resetMockGateway();
    mockGatewayControls.forceOutcome = 'SUCCESS';
    // 30_000 a seat, two seats: 63_000 total at the default fee, so the
    // booking itself earns exactly 6 points to tell apart from any prize.
    show = await createShowtime({ seatCount: 12, priceMinor: 30_000, startsInMinutes: 600 });
    alice = await createUser('alice');
    bob = await createUser('bob');
  });

  async function confirmedBooking(user: TestUser, seatIndexes: number[]) {
    const held = await request(app)
      .post(`/v1/showtimes/${show.showtimeId}/holds`)
      .set(user.auth)
      .set('Idempotency-Key', idempotencyKey('hold'))
      .send({ showSeatIds: seatIndexes.map((i) => show.showSeatIds[i]) })
      .expect(201);
    const paid = await request(app)
      .post('/v1/checkout')
      .set(user.auth)
      .set('Idempotency-Key', idempotencyKey('pay'))
      .send({ holdId: held.body.id, method: 'CARD' })
      .expect(201);
    await waitFor(async () => {
      const booking = await prisma.booking.findUnique({ where: { id: paid.body.bookingId } });
      return booking?.status === 'CONFIRMED';
    });
    return paid.body.bookingId as string;
  }

  const cards = async (user: TestUser) =>
    (await request(app).get('/v1/rewards').set(user.auth).expect(200)).body.cards as {
      id: string;
      points: number | null;
      scratchedAt: string | null;
      bookingReference: string;
    }[];

  const balanceOf = async (user: TestUser) =>
    (await request(app).get('/v1/loyalty/balance').set(user.auth).expect(200)).body as {
      balance: number;
      lifetimePoints: number;
    };

  it('gives a new account nothing to scratch', async () => {
    expect(await cards(alice)).toEqual([]);
  });

  it('issues exactly one card when a booking confirms', async () => {
    await confirmedBooking(alice, [0, 1]);
    const issued = await cards(alice);
    expect(issued).toHaveLength(1);
    expect(firstOf(issued, 'card').scratchedAt).toBe(null);
  });

  it('does not reveal the prize before it is scratched', async () => {
    // The prize exists on the server from the moment the booking confirms, so
    // this is the assertion that stops the list endpoint leaking it.
    await confirmedBooking(alice, [0, 1]);
    const card = firstOf(await cards(alice), 'card');
    expect(card.points).toBe(null);

    const stored = await prisma.scratchCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(stored.points).toBeGreaterThan(0);
  });

  it('reveals the stored prize and pays it into the balance', async () => {
    await confirmedBooking(alice, [0, 1]);
    const card = firstOf(await cards(alice), 'card');
    const stored = await prisma.scratchCard.findUniqueOrThrow({ where: { id: card.id } });
    const before = await balanceOf(alice);

    const res = await request(app)
      .post(`/v1/rewards/${card.id}/scratch`)
      .set(alice.auth)
      .expect(200);

    expect(res.body.card.points).toBe(stored.points);
    expect(res.body.card.scratchedAt).not.toBe(null);
    expect(res.body.balance).toBe(before.balance + stored.points);
    expect((await balanceOf(alice)).balance).toBe(before.balance + stored.points);
  });

  it('does not count a win towards the tier, which ranks spending', async () => {
    await confirmedBooking(alice, [0, 1]);
    const card = firstOf(await cards(alice), 'card');
    const before = await balanceOf(alice);
    expect(before.lifetimePoints).toBe(6);

    await request(app).post(`/v1/rewards/${card.id}/scratch`).set(alice.auth).expect(200);

    const after = await balanceOf(alice);
    expect(after.lifetimePoints).toBe(6);
    expect(after.balance).toBeGreaterThan(before.balance);
  });

  it('pays a card once however many times it is scratched', async () => {
    await confirmedBooking(alice, [0, 1]);
    const card = firstOf(await cards(alice), 'card');

    const firstTap = await request(app)
      .post(`/v1/rewards/${card.id}/scratch`)
      .set(alice.auth)
      .expect(200);
    const secondTap = await request(app)
      .post(`/v1/rewards/${card.id}/scratch`)
      .set(alice.auth)
      .expect(200);

    // Same prize, same timestamp, one payment.
    expect(secondTap.body.card.points).toBe(firstTap.body.card.points);
    expect(secondTap.body.card.scratchedAt).toBe(firstTap.body.card.scratchedAt);
    expect(secondTap.body.balance).toBe(firstTap.body.balance);

    const ledger = await prisma.loyaltyLedger.findMany({
      where: { userId: alice.id, reason: 'SCRATCHED' },
    });
    expect(ledger).toHaveLength(1);
  });

  it('survives two simultaneous taps', async () => {
    await confirmedBooking(alice, [0, 1]);
    const card = firstOf(await cards(alice), 'card');

    const results = await Promise.all([
      request(app).post(`/v1/rewards/${card.id}/scratch`).set(alice.auth),
      request(app).post(`/v1/rewards/${card.id}/scratch`).set(alice.auth),
    ]);

    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const ledger = await prisma.loyaltyLedger.findMany({
      where: { userId: alice.id, reason: 'SCRATCHED' },
    });
    expect(ledger).toHaveLength(1);
  });

  it('will not let somebody scratch a card that is not theirs', async () => {
    await confirmedBooking(alice, [0, 1]);
    const card = firstOf(await cards(alice), 'card');

    // 404 rather than 403: "forbidden" would confirm the id exists, which is
    // not something a stranger holding a guessed id is entitled to learn.
    await request(app).post(`/v1/rewards/${card.id}/scratch`).set(bob.auth).expect(404);
    expect(await cards(bob)).toEqual([]);

    const stored = await prisma.scratchCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(stored.scratchedAt).toBe(null);
  });

  it('answers 404 for an id that was never a card', async () => {
    await request(app).post('/v1/rewards/not-a-real-card/scratch').set(alice.auth).expect(404);
  });

  it('needs a signed-in account', async () => {
    await request(app).get('/v1/rewards').expect(401);
    await request(app).post('/v1/rewards/anything/scratch').expect(401);
  });

  it('puts the card still worth tapping first', async () => {
    await confirmedBooking(alice, [0, 1]);
    const firstCard = firstOf(await cards(alice), 'card');
    await request(app).post(`/v1/rewards/${firstCard.id}/scratch`).set(alice.auth).expect(200);

    await confirmedBooking(alice, [2, 3]);
    const listed = await cards(alice);
    expect(listed).toHaveLength(2);
    expect(firstOf(listed, 'card').scratchedAt).toBe(null);
    expect(listed[1]?.id).toBe(firstCard.id);
  });
});
