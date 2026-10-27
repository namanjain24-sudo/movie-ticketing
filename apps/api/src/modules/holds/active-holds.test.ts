import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { prisma } from '../../db';
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

/**
 * Resuming a hold that the app walked away from.
 *
 * The hold is the one piece of state here that is losing value while nobody
 * is looking at it, so the endpoint's whole job is to be right about which
 * ones are still worth offering: this account's, still active, not past their
 * deadline by the database's clock rather than this process's.
 */
describe('active holds', () => {
  let user: TestUser;
  let show: TestShowtime;

  beforeEach(async () => {
    await resetDb();
    user = await createUser();
    show = await createShowtime();
  });

  const hold = (who: TestUser, seats: string[]) =>
    request(app)
      .post(`/v1/showtimes/${show.showtimeId}/holds`)
      .set(who.auth)
      .set('Idempotency-Key', idempotencyKey('active-holds'))
      .send({ showSeatIds: seats })
      .expect(201);

  const list = (who: TestUser) =>
    request(app).get('/v1/holds/active').set(who.auth).expect(200);

  it('needs a session', async () => {
    await request(app).get('/v1/holds/active').expect(401);
  });

  it('is empty when nothing is held', async () => {
    const res = await list(user);
    expect(res.body.holds).toEqual([]);
  });

  it('returns a held seat with enough of the showtime to name it', async () => {
    const created = await hold(user, show.showSeatIds.slice(0, 2));

    const res = await list(user);

    expect(res.body.holds).toHaveLength(1);
    const [entry] = res.body.holds;
    expect(entry.hold.id).toBe(created.body.id);
    expect(entry.hold.status).toBe('ACTIVE');
    expect(entry.hold.seats).toHaveLength(2);
    // Enough to say "two seats at the Grand, for Test Film" without a second
    // request, which is the entire point of the banner this feeds.
    expect(entry.showtime.movie.title).toBeTruthy();
    expect(entry.showtime.cinema.name).toBeTruthy();
    expect(entry.showtime.screen.name).toBeTruthy();
    expect(entry.hold.totalMinor).toBeGreaterThan(0);
    // The countdown is drawn from these two and never from the device clock.
    expect(entry.hold.expiresAt).toBeTruthy();
    expect(entry.hold.serverTime).toBeTruthy();
  });

  it('is not matched by the hold-by-id route', async () => {
    // Express matches in declaration order, so registered after `/holds/:id`
    // this path reads as a hold whose id is the word "active" — a 404 that
    // looks exactly like a missing feature.
    const res = await list(user);
    expect(res.body).toHaveProperty('holds');
  });

  it('never shows another account’s hold', async () => {
    const stranger = await createUser('stranger');
    await hold(stranger, show.showSeatIds.slice(0, 1));

    const res = await list(user);

    expect(res.body.holds).toEqual([]);
  });

  it('drops a hold the moment it expires, before any sweeper runs', async () => {
    const created = await hold(user, show.showSeatIds.slice(0, 1));
    expect((await list(user)).body.holds).toHaveLength(1);

    await expireHold(created.body.id);

    // The row is still ACTIVE in the table at this point. Expiry is decided
    // on the read path, so offering to resume it would hand somebody a
    // checkout that fails the instant they tap pay.
    const row = await prisma.hold.findUniqueOrThrow({
      where: { id: created.body.id },
      select: { status: true },
    });
    expect(row.status).toBe('ACTIVE');
    expect((await list(user)).body.holds).toEqual([]);
  });

  it('drops a hold that was released', async () => {
    const created = await hold(user, show.showSeatIds.slice(0, 1));
    await request(app).delete(`/v1/holds/${created.body.id}`).set(user.auth).expect(204);

    expect((await list(user)).body.holds).toEqual([]);
  });

  it('drops a hold once it has become a booking', async () => {
    const created = await hold(user, show.showSeatIds.slice(0, 1));
    await request(app)
      .post('/v1/checkout')
      .set(user.auth)
      .set('Idempotency-Key', idempotencyKey('checkout'))
      .send({ holdId: created.body.id })
      .expect(201);

    // CONVERTED, not ACTIVE: there is nothing left to resume, and the ticket
    // is reachable from Tickets.
    expect((await list(user)).body.holds).toEqual([]);
  });

  it('lists several holds, the one expiring last first', async () => {
    const first = await hold(user, show.showSeatIds.slice(0, 1));
    const second = await hold(user, show.showSeatIds.slice(1, 2));

    const res = await list(user);
    const ids = res.body.holds.map((h: { hold: { id: string } }) => h.hold.id);

    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(second.body.id);
    expect(ids[1]).toBe(first.body.id);
  });
});
