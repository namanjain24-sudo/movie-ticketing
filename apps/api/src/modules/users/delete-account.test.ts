import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { prisma } from '../../db';
import {
  createShowtime,
  idempotencyKey,
  resetDb,
  waitFor,
  type TestShowtime,
  type TestUser,
} from '../../test/helpers';
import { mockGatewayControls, resetMockGateway } from '../payments/gateway';

const app = createApp();

/**
 * Closing an account.
 *
 * The law gives a right to erasure and the app stores refuse an update
 * without one, but neither permits taking the money with it: every relation
 * on `User` cascades, so these tests are mostly about what must *survive* a
 * deletion as much as what must not.
 */
describe('deleting an account', () => {
  const PASSWORD = 'CorrectHorse9';

  let show: TestShowtime;
  let alice: TestUser & { password: string };

  /**
   * Registered through the API rather than built by `createUser`, which
   * writes a literal string into `passwordHash` because nothing else needs to
   * sign in. This flow asks for the password, so it needs a real hash.
   */
  async function register(label: string) {
    const email = `${label}-${Date.now()}@test.local`;
    const res = await request(app)
      .post('/v1/auth/register')
      .send({ email, password: PASSWORD, name: label })
      .expect(201);
    const token = res.body.tokens.accessToken as string;
    return {
      id: res.body.user.id as string,
      email,
      password: PASSWORD,
      token,
      auth: { Authorization: `Bearer ${token}` },
    };
  }

  beforeEach(async () => {
    await resetDb();
    resetMockGateway();
    mockGatewayControls.forceOutcome = 'SUCCESS';
    show = await createShowtime({ seatCount: 12, priceMinor: 30_000, startsInMinutes: 600 });
    alice = await register('alice-del');
  });

  const close = (user: TestUser, password: string) =>
    request(app).post('/v1/users/me/delete').set(user.auth).send({ password });

  /** Holds and pays for seats, so there is a financial record to protect. */
  async function buy(user: TestUser, seatIndexes: number[]) {
    const held = await request(app)
      .post(`/v1/showtimes/${show.showtimeId}/holds`)
      .set(user.auth)
      .set('Idempotency-Key', idempotencyKey('del-hold'))
      .send({ showSeatIds: seatIndexes.map((i) => show.showSeatIds[i]) })
      .expect(201);
    const paid = await request(app)
      .post('/v1/checkout')
      .set(user.auth)
      .set('Idempotency-Key', idempotencyKey('del-pay'))
      .send({ holdId: held.body.id, method: 'CARD' })
      .expect(201);
    await waitFor(async () => {
      const booking = await prisma.booking.findUnique({ where: { id: paid.body.bookingId } });
      return booking?.status === 'CONFIRMED';
    });
    return paid.body.bookingId as string;
  }

  it('needs an account', async () => {
    await request(app).post('/v1/users/me/delete').send({ password: 'x' }).expect(401);
  });

  it('refuses the wrong password and changes nothing', async () => {
    await close(alice, 'not-the-password').expect(401);

    const still = await prisma.user.findUniqueOrThrow({ where: { id: alice.id } });
    expect(still.name).not.toBe('Deleted account');
    expect(still.email).not.toContain('deleted.invalid');
  });

  it('needs a password at all', async () => {
    await request(app).post('/v1/users/me/delete').set(alice.auth).send({}).expect(400);
  });

  describe('once it is done', () => {
    it('scrubs the name and the address', async () => {
      await close(alice, alice.password).expect(204);

      const row = await prisma.user.findUniqueOrThrow({ where: { id: alice.id } });
      expect(row.name).toBe('Deleted account');
      expect(row.email).toBe(`deleted-${alice.id}@deleted.invalid`);
      expect(row.avatarUrl).toBeNull();
    });

    it('cannot be signed in to again', async () => {
      const email = alice.email;
      await close(alice, alice.password).expect(204);

      await request(app)
        .post('/v1/auth/login')
        .send({ email, password: alice.password })
        .expect(401);
    });

    it('ends every session, so a signed-in device does not stay signed in', async () => {
      await close(alice, alice.password).expect(204);

      expect(await prisma.refreshToken.count({ where: { userId: alice.id } })).toBe(0);
      // The access token is short-lived but still valid; what matters is that
      // it cannot be renewed into a new one.
      await request(app).get('/v1/users/me').set(alice.auth).expect(404);
    });

    it('frees the address to be registered again', async () => {
      const email = alice.email;
      await close(alice, alice.password).expect(204);

      await request(app)
        .post('/v1/auth/register')
        .send({ email, password: 'BrandNewPass9', name: 'Somebody Else' })
        .expect(201);
    });
  });

  describe('what must survive it', () => {
    it('keeps the booking, which is the cinema’s record as much as anybody’s', async () => {
      const bookingId = await buy(alice, [0, 1]);
      await close(alice, alice.password).expect(204);

      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      expect(booking?.status).toBe('CONFIRMED');
      // Deleting the user row would have taken this with it: every relation
      // on `User` cascades.
      expect(booking?.userId).toBe(alice.id);
    });

    it('keeps the seats sold rather than returning them to the room', async () => {
      await buy(alice, [0, 1]);
      await close(alice, alice.password).expect(204);

      const sold = await prisma.showSeat.count({
        where: { showtimeId: show.showtimeId, state: 'CONFIRMED' },
      });
      expect(sold).toBe(2);
    });

    it('keeps the loyalty ledger, which is money', async () => {
      await buy(alice, [0, 1]);
      const before = await prisma.loyaltyLedger.count({ where: { userId: alice.id } });
      expect(before).toBeGreaterThan(0);

      await close(alice, alice.password).expect(204);
      expect(await prisma.loyaltyLedger.count({ where: { userId: alice.id } })).toBe(before);
    });
  });

  describe('what must not survive it', () => {
    it('drops the watchlist', async () => {
      await request(app)
        .put(`/v1/users/me/watchlist/${show.movieId}`)
        .set(alice.auth)
        .expect((res) => {
          if (![200, 201, 204].includes(res.status)) throw new Error(`got ${res.status}`);
        });
      expect(await prisma.watchlistItem.count({ where: { userId: alice.id } })).toBe(1);

      await close(alice, alice.password).expect(204);
      expect(await prisma.watchlistItem.count({ where: { userId: alice.id } })).toBe(0);
    });

    it('releases seats still on hold instead of leaving them held by nobody', async () => {
      await request(app)
        .post(`/v1/showtimes/${show.showtimeId}/holds`)
        .set(alice.auth)
        .set('Idempotency-Key', idempotencyKey('del-live'))
        .send({ showSeatIds: [show.showSeatIds[4], show.showSeatIds[5]] })
        .expect(201);

      await close(alice, alice.password).expect(204);

      const active = await prisma.hold.count({ where: { userId: alice.id, status: 'ACTIVE' } });
      expect(active).toBe(0);
    });
  });
});
