import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { PLAN_CODE_ALPHABET, PLAN_CODE_LENGTH } from '@app/shared';
import { createApp } from '../../app';
import { prisma } from '../../db';
import {
  createShowtime,
  createUser,
  resetDb,
  type TestShowtime,
  type TestUser,
} from '../../test/helpers';

const app = createApp();

/**
 * Another showing of the same film, which `createShowtime` cannot give: it
 * mints a fresh movie and cinema every call, and a plan is a shortlist for one
 * film. `city` is a parameter because "all in one city" is a rule worth a test.
 */
async function siblingShowing(
  base: TestShowtime,
  minutesFromNow: number,
  city = 'Testville',
): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const cinema = await prisma.cinema.create({
    data: {
      slug: `sib-cinema-${suffix}`,
      name: `Sibling Cinema ${suffix}`,
      brand: 'Test',
      city,
      address: '2 Test Road',
      latitude: 0,
      longitude: 0,
    },
  });
  const screen = await prisma.screen.create({
    data: { cinemaId: cinema.id, name: 'Audi 1', rowCount: 1, columnCount: 4 },
  });
  const startsAt = new Date(Date.now() + minutesFromNow * 60_000);
  const showtime = await prisma.showtime.create({
    data: {
      movieId: base.movieId,
      screenId: screen.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 150 * 60_000),
      salesCloseAt: new Date(startsAt.getTime() + 10 * 60_000),
      format: 'TWO_D',
      language: 'Hindi',
      tierPrices: { create: [{ tier: 'STANDARD', priceMinor: 25_000 }] },
    },
  });
  return showtime.id;
}

describe('watch party plans', () => {
  let base: TestShowtime;
  let later: string;
  let organiser: TestUser;
  let friend: TestUser;
  let stranger: TestUser;

  beforeEach(async () => {
    await resetDb();
    base = await createShowtime({ seatCount: 6, startsInMinutes: 180 });
    later = await siblingShowing(base, 300);
    organiser = await createUser('organiser');
    friend = await createUser('friend');
    stranger = await createUser('stranger');
  });

  const create = (user: TestUser, showtimeIds: string[], movieId = base.movieId) =>
    request(app).post('/v1/plans').set(user.auth).send({ movieId, showtimeIds });

  const read = (code: string, user?: TestUser) => {
    const req = request(app).get(`/v1/plans/${code}`);
    return user ? req.set(user.auth) : req;
  };

  const join = (code: string, user: TestUser) =>
    request(app).post(`/v1/plans/${code}/join`).set(user.auth);

  const vote = (code: string, user: TestUser, optionId: string) =>
    request(app).post(`/v1/plans/${code}/votes`).set(user.auth).send({ optionId });

  async function newPlan() {
    const res = await create(organiser, [base.showtimeId, later]).expect(201);
    return res.body as {
      code: string;
      memberCount: number;
      options: { id: string; showtimeId: string; votes: number; youVoted: boolean }[];
    };
  }

  describe('creating one', () => {
    it('gives back a code made only of characters nobody mistypes', async () => {
      const plan = await newPlan();
      expect(plan.code).toHaveLength(PLAN_CODE_LENGTH);
      for (const char of plan.code) expect(PLAN_CODE_ALPHABET).toContain(char);
    });

    it('counts the organiser as a member from the start', async () => {
      // A tally that ignored the person who made the plan would be wrong from
      // the first vote.
      const plan = await newPlan();
      expect(plan.memberCount).toBe(1);
      expect(plan.options.every((o) => o.votes === 0)).toBe(true);
    });

    it('refuses a shortlist of one', async () => {
      await create(organiser, [base.showtimeId]).expect(400);
    });

    it('refuses a shortlist that is the same showing twice', async () => {
      await create(organiser, [base.showtimeId, base.showtimeId]).expect(400);
    });

    it('refuses showings of a different film', async () => {
      const other = await createShowtime({ seatCount: 4, startsInMinutes: 200 });
      await create(organiser, [base.showtimeId, other.showtimeId]).expect(400);
    });

    it('refuses a shortlist spanning two cities', async () => {
      const abroad = await siblingShowing(base, 320, 'Otherville');
      await create(organiser, [base.showtimeId, abroad]).expect(400);
    });

    it('refuses a showing that has already started', async () => {
      const past = await siblingShowing(base, -30);
      await create(organiser, [base.showtimeId, past]).expect(400);
    });

    it('needs an account', async () => {
      await request(app)
        .post('/v1/plans')
        .send({ movieId: base.movieId, showtimeIds: [base.showtimeId, later] })
        .expect(401);
    });
  });

  describe('opening one', () => {
    it('is readable without signing in, because the code arrives in a chat', async () => {
      const plan = await newPlan();
      const res = await read(plan.code).expect(200);
      expect(res.body.options).toHaveLength(2);
      expect(res.body.youJoined).toBe(false);
      expect(res.body.youAreOrganiser).toBe(false);
    });

    it('opens whatever case the code was typed in', async () => {
      const plan = await newPlan();
      await read(plan.code.toLowerCase()).expect(200);
    });

    it('lists the showings in time order, not by votes', async () => {
      const plan = await newPlan();
      const res = await read(plan.code, organiser).expect(200);
      const times = res.body.options.map((o: { startsAt: string }) => o.startsAt);
      expect([...times].sort()).toEqual(times);
    });

    it('answers 404 for a code that was never issued', async () => {
      await read('ZZZZZZ').expect(404);
    });
  });

  describe('joining', () => {
    it('adds a member and is safe to repeat', async () => {
      const plan = await newPlan();
      const first = await join(plan.code, friend).expect(200);
      expect(first.body.memberCount).toBe(2);
      expect(first.body.youJoined).toBe(true);

      const second = await join(plan.code, friend).expect(200);
      expect(second.body.memberCount).toBe(2);
    });

    it('needs an account', async () => {
      const plan = await newPlan();
      await request(app).post(`/v1/plans/${plan.code}/join`).expect(401);
    });
  });

  describe('marking the showings you can make', () => {
    it('counts a mark and shows it back to the person who made it', async () => {
      const plan = await newPlan();
      await join(plan.code, friend).expect(200);
      const optionId = plan.options[0]?.id ?? '';

      const res = await vote(plan.code, friend, optionId).expect(200);
      const marked = res.body.options.find((o: { id: string }) => o.id === optionId);
      expect(marked.votes).toBe(1);
      expect(marked.youVoted).toBe(true);
    });

    it('takes the mark back when it is tapped again', async () => {
      const plan = await newPlan();
      const optionId = plan.options[0]?.id ?? '';
      await vote(plan.code, organiser, optionId).expect(200);
      const res = await vote(plan.code, organiser, optionId).expect(200);
      const marked = res.body.options.find((o: { id: string }) => o.id === optionId);
      expect(marked.votes).toBe(0);
      expect(marked.youVoted).toBe(false);
    });

    it('lets one person mark more than one showing, which is the point', async () => {
      const plan = await newPlan();
      const [a, b] = plan.options;
      await vote(plan.code, organiser, a?.id ?? '').expect(200);
      const res = await vote(plan.code, organiser, b?.id ?? '').expect(200);
      expect(res.body.options.every((o: { youVoted: boolean }) => o.youVoted)).toBe(true);
    });

    it('adds up marks from different people', async () => {
      const plan = await newPlan();
      await join(plan.code, friend).expect(200);
      const optionId = plan.options[0]?.id ?? '';
      await vote(plan.code, organiser, optionId).expect(200);
      const res = await vote(plan.code, friend, optionId).expect(200);
      expect(res.body.options.find((o: { id: string }) => o.id === optionId).votes).toBe(2);
    });

    it('will not count somebody who has not joined', async () => {
      // Otherwise a tally could exceed its own membership, which makes "four
      // out of five" meaningless.
      const plan = await newPlan();
      await vote(plan.code, stranger, plan.options[0]?.id ?? '').expect(403);
    });

    it('refuses a showing that is not on this plan', async () => {
      const plan = await newPlan();
      const otherBase = await createShowtime({ seatCount: 4, startsInMinutes: 240 });
      const otherLater = await siblingShowing(otherBase, 400);
      const other = await create(
        organiser,
        [otherBase.showtimeId, otherLater],
        otherBase.movieId,
      ).expect(201);

      await vote(plan.code, organiser, other.body.options[0].id).expect(404);
    });
  });

  describe('once it is over', () => {
    it('reads as settled and refuses new marks', async () => {
      const plan = await newPlan();
      // Push both showings into the past, which is what time would have done.
      await prisma.showtime.updateMany({
        where: { id: { in: [base.showtimeId, later] } },
        data: { startsAt: new Date(Date.now() - 60 * 60_000) },
      });
      await prisma.plan.update({
        where: { code: plan.code },
        data: { expiresAt: new Date(Date.now() - 30 * 60_000) },
      });

      const res = await read(plan.code, organiser).expect(200);
      expect(res.body.settled).toBe(true);
      await vote(plan.code, organiser, plan.options[0]?.id ?? '').expect(409);
      await join(plan.code, friend).expect(409);
    });
  });

  describe('my plans', () => {
    it('lists the ones this account is in', async () => {
      const plan = await newPlan();
      const mine = await request(app).get('/v1/plans').set(organiser.auth).expect(200);
      expect(mine.body.plans.map((p: { code: string }) => p.code)).toEqual([plan.code]);

      const theirs = await request(app).get('/v1/plans').set(stranger.auth).expect(200);
      expect(theirs.body.plans).toEqual([]);
    });

    it('leaves out plans that are over', async () => {
      const plan = await newPlan();
      await prisma.plan.update({
        where: { code: plan.code },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      const mine = await request(app).get('/v1/plans').set(organiser.auth).expect(200);
      expect(mine.body.plans).toEqual([]);
    });
  });
});
