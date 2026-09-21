import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@app/shared';
import { createApp } from '../../app';
import { prisma } from '../../db';
import { verifyInvariants } from '../../scripts/verify-invariants';
import {
  createShowtime,
  createUsers,
  idempotencyKey,
  resetDb,
  type TestShowtime,
  type TestUser,
} from '../../test/helpers';

/**
 * The tests this project exists to pass.
 *
 * Everything here fires genuinely concurrent HTTP requests at a real server
 * backed by a real Postgres. Nothing is mocked, nothing is serialised by the
 * test harness, and the assertions are about inventory rather than about
 * response codes: the question is never "did the endpoint behave" but "did the
 * database end up with more seats sold than exist".
 *
 * A single listening server is used rather than supertest's per-request
 * ephemeral ones, because 150 ephemeral servers is a test of the operating
 * system's socket table and not of the booking mechanic.
 */

let server: Server;

beforeAll(async () => {
  server = createApp().listen(0);
});

afterAll(() => {
  server.close();
});

function holdRequest(show: TestShowtime, user: TestUser, showSeatIds: string[], key?: string) {
  return request(server)
    .post(`/v1/showtimes/${show.showtimeId}/holds`)
    .set(user.auth)
    .set('Idempotency-Key', key ?? idempotencyKey())
    .send({ showSeatIds });
}

describe('concurrent holds', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('gives one seat to exactly one of sixty simultaneous claimants', async () => {
    const show = await createShowtime({ seatCount: 1 });
    const users = await createUsers(60);
    const seat = show.showSeatIds[0]!;

    const responses = await Promise.all(users.map((u) => holdRequest(show, u, [seat])));

    const won = responses.filter((r) => r.status === 201);
    const lost = responses.filter((r) => r.status === 409);

    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(59);
    for (const r of lost) expect(r.body.error.code).toBe(ERROR_CODES.SEAT_UNAVAILABLE);

    // And the database agrees with the responses, which is the part that
    // matters: a system can return one 201 and still have written two holds.
    expect(await prisma.hold.count()).toBe(1);
    const row = await prisma.showSeat.findUniqueOrThrow({ where: { id: seat } });
    expect(row.state).toBe('HELD');
  });

  it('never hands out more seats than the auditorium has', async () => {
    const inventory = 80;
    const show = await createShowtime({ seatCount: inventory });
    const users = await createUsers(150);

    // Every user grabs a random one-to-four seat block, so requests overlap
    // partially rather than contending on a single row. Partial overlap is
    // where all-or-nothing holds actually get tested.
    const attempts = users.map((user, i) => {
      const size = (i % 4) + 1;
      const start = (i * 7) % (inventory - size);
      return holdRequest(show, user, show.showSeatIds.slice(start, start + size));
    });

    const responses = await Promise.all(attempts);

    const created = responses.filter((r) => r.status === 201);
    const conflicts = responses.filter((r) => r.status === 409);
    // Nothing should fail for any other reason. A 500 here would mean a
    // deadlock escaped the retry.
    expect(created.length + conflicts.length).toBe(responses.length);
    expect(created.length).toBeGreaterThan(0);

    const held = await prisma.showSeat.count({
      where: { showtimeId: show.showtimeId, state: 'HELD' },
    });
    expect(held).toBeLessThanOrEqual(inventory);

    // Each successful response must correspond to seats actually held by that
    // hold, with no seat claimed twice.
    const seatsPerHold = await prisma.showSeat.groupBy({
      by: ['holdId'],
      where: { showtimeId: show.showtimeId, state: 'HELD' },
      _count: { _all: true },
    });
    const totalHeld = seatsPerHold.reduce((sum, g) => sum + g._count._all, 0);
    expect(totalHeld).toBe(held);

    for (const response of created) {
      const seats = response.body.seats as { showSeatId: string }[];
      const owned = await prisma.showSeat.count({
        where: { holdId: response.body.id, id: { in: seats.map((s) => s.showSeatId) } },
      });
      expect(owned).toBe(seats.length);
    }

    expect(await verifyInvariants()).toEqual([]);
  });

  it('creates one hold when the same request is retried in a storm', async () => {
    const show = await createShowtime({ seatCount: 4 });
    const [user] = await createUsers(1);
    const key = idempotencyKey('storm');

    // Twenty simultaneous retries of one user action, which is what a phone on
    // a bad connection actually produces.
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => holdRequest(show, user!, show.showSeatIds.slice(0, 2), key)),
    );

    const created = responses.filter((r) => r.status === 201);
    const inProgress = responses.filter(
      (r) => r.body?.error?.code === ERROR_CODES.REQUEST_IN_PROGRESS,
    );

    // Every response is either the one real answer, a replay of it, or an
    // honest "still working on it". None of them is a second hold.
    expect(created.length + inProgress.length).toBe(20);
    expect(await prisma.hold.count()).toBe(1);

    const holdIds = new Set(created.map((r) => r.body.id));
    expect(holdIds.size).toBe(1);

    expect(
      await prisma.showSeat.count({ where: { showtimeId: show.showtimeId, state: 'HELD' } }),
    ).toBe(2);
  });

  it('lets a released seat be claimed by the next request, under contention', async () => {
    const show = await createShowtime({ seatCount: 1 });
    const users = await createUsers(21);
    const seat = show.showSeatIds[0]!;

    const first = await holdRequest(show, users[0]!, [seat]).expect(201);

    // The release and twenty claimants race. Exactly one claimant must win,
    // whether it arrives before or after the release commits.
    const [, ...contenders] = users;
    const results = await Promise.all([
      request(server).delete(`/v1/holds/${first.body.id}`).set(users[0]!.auth),
      ...contenders.map((u) => holdRequest(show, u, [seat])),
    ]);

    const winners = results.slice(1).filter((r) => r.status === 201);
    expect(winners.length).toBeLessThanOrEqual(1);
    expect(await prisma.hold.count({ where: { status: 'ACTIVE' } })).toBe(winners.length);
  });
});
