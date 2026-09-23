import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
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
import { mockGatewayControls, resetMockGateway } from '../payments/gateway';
import { addOnsTotal, priceAddOns } from './concessions.service';

const app = createApp();

const item = (overrides: Record<string, unknown> = {}) =>
  prisma.concessionItem.create({
    data: {
      name: 'Popcorn',
      description: 'Salted',
      priceMinor: 25_000,
      ...overrides,
    } as never,
  });

describe('priceAddOns', () => {
  beforeEach(resetDb);

  it('prices requested lines against the live catalogue, not a client-sent price', async () => {
    const popcorn = await item({ name: 'Popcorn', priceMinor: 25_000 });
    const priced = await priceAddOns(prisma, [{ itemId: popcorn.id, quantity: 2 }]);
    expect(priced).toEqual([
      { itemId: popcorn.id, name: 'Popcorn', quantity: 2, unitPriceMinor: 25_000 },
    ]);
    expect(addOnsTotal(priced)).toBe(50_000);
  });

  it('merges two lines for the same item rather than creating two rows', async () => {
    const popcorn = await item();
    const priced = await priceAddOns(prisma, [
      { itemId: popcorn.id, quantity: 1 },
      { itemId: popcorn.id, quantity: 2 },
    ]);
    expect(priced).toEqual([
      { itemId: popcorn.id, name: 'Popcorn', quantity: 3, unitPriceMinor: 25_000 },
    ]);
  });

  it('refuses an item that has gone inactive since the menu was fetched', async () => {
    const gone = await item({ active: false });
    await expect(priceAddOns(prisma, [{ itemId: gone.id, quantity: 1 }])).rejects.toMatchObject({
      status: 400,
    });
  });

  it('refuses an item id that does not exist', async () => {
    await expect(
      priceAddOns(prisma, [{ itemId: 'nope', quantity: 1 }]),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('is a no-op for an empty request', async () => {
    expect(await priceAddOns(prisma, [])).toEqual([]);
  });
});

describe('GET /v1/concessions', () => {
  beforeEach(resetDb);

  it('lists only active items', async () => {
    await item({ name: 'Popcorn', active: true });
    await item({ name: 'Discontinued combo', active: false });

    const res = await request(app).get('/v1/concessions').expect(200);
    expect(res.body.items.map((i: { name: string }) => i.name)).toEqual(['Popcorn']);
  });
});

describe('checkout with add-ons', () => {
  let show: TestShowtime;
  let alice: TestUser;

  beforeEach(async () => {
    await resetDb();
    resetMockGateway();
    mockGatewayControls.forceOutcome = 'SUCCESS';
    show = await createShowtime({ seatCount: 4, priceMinor: 30_000, startsInMinutes: 600 });
    alice = await createUser('alice');
  });

  async function hold() {
    const res = await request(app)
      .post(`/v1/showtimes/${show.showtimeId}/holds`)
      .set(alice.auth)
      .set('Idempotency-Key', idempotencyKey('hold'))
      .send({ showSeatIds: [show.showSeatIds[0], show.showSeatIds[1]] })
      .expect(201);
    return res.body as { id: string; subtotalMinor: number; feeMinor: number };
  }

  it('adds the priced add-on total to the booking, and confirms with them attached', async () => {
    const popcorn = await item({ name: 'Popcorn', priceMinor: 25_000 });
    const water = await item({ name: 'Water', priceMinor: 4_000 });
    const h = await hold();

    const res = await request(app)
      .post('/v1/checkout')
      .set(alice.auth)
      .set('Idempotency-Key', idempotencyKey('pay'))
      .send({
        holdId: h.id,
        method: 'CARD',
        addOns: [
          { itemId: popcorn.id, quantity: 2 },
          { itemId: water.id, quantity: 1 },
        ],
      })
      .expect(201);

    const addOnsMinor = 2 * 25_000 + 1 * 4_000;
    expect(res.body.amountMinor).toBe(h.subtotalMinor + h.feeMinor + addOnsMinor);

    await waitFor(async () => {
      const b = await prisma.booking.findUnique({ where: { id: res.body.bookingId } });
      return b?.status === 'CONFIRMED';
    });

    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: res.body.bookingId },
      include: { addOns: true },
    });
    expect(booking.addOnsMinor).toBe(addOnsMinor);
    expect(booking.totalMinor).toBe(booking.subtotalMinor + booking.feeMinor + addOnsMinor);
    expect(booking.addOns).toHaveLength(2);

    const violations = await verifyInvariants();
    expect(violations).toEqual([]);
  });

  it('confirms with no add-ons exactly as before, addOnsMinor at zero', async () => {
    const h = await hold();
    const res = await request(app)
      .post('/v1/checkout')
      .set(alice.auth)
      .set('Idempotency-Key', idempotencyKey('pay'))
      .send({ holdId: h.id, method: 'CARD' })
      .expect(201);

    expect(res.body.amountMinor).toBe(h.subtotalMinor + h.feeMinor);

    await waitFor(async () => {
      const b = await prisma.booking.findUnique({ where: { id: res.body.bookingId } });
      return b?.status === 'CONFIRMED';
    });
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: res.body.bookingId } });
    expect(booking.addOnsMinor).toBe(0);
  });

  it('rejects checkout naming an add-on that does not exist', async () => {
    const h = await hold();
    await request(app)
      .post('/v1/checkout')
      .set(alice.auth)
      .set('Idempotency-Key', idempotencyKey('pay'))
      .send({ holdId: h.id, method: 'CARD', addOns: [{ itemId: 'nope', quantity: 1 }] })
      .expect(400);
  });
});
