import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { prisma } from '../../db';
import { createUser, resetDb, type TestUser } from '../../test/helpers';

const app = createApp();

describe('favorite cinemas', () => {
  let alice: TestUser;
  let bob: TestUser;
  let cinemaSlug: string;
  let cinemaId: string;

  beforeEach(async () => {
    await resetDb();
    alice = await createUser('alice');
    bob = await createUser('bob');
    const cinema = await prisma.cinema.create({
      data: {
        slug: 'test-pvr-icon',
        name: 'Test PVR Icon',
        brand: 'PVR',
        city: 'Mumbai',
        address: '1 Test Road',
        latitude: 19.0,
        longitude: 72.8,
      },
    });
    cinemaSlug = cinema.slug;
    cinemaId = cinema.id;
  });

  const save = (user: TestUser, cinema = cinemaSlug) =>
    request(app).put(`/v1/users/me/favorite-cinemas/${cinema}`).set(user.auth);
  const unsave = (user: TestUser, cinema = cinemaSlug) =>
    request(app).delete(`/v1/users/me/favorite-cinemas/${cinema}`).set(user.auth);
  const list = (user: TestUser) => request(app).get('/v1/users/me/favorite-cinemas').set(user.auth);

  it('starts empty', async () => {
    const res = await list(alice).expect(200);
    expect(res.body.cinemas).toEqual([]);
  });

  it('saves a cinema by slug and by id', async () => {
    await save(alice).expect(204);
    let res = await list(alice).expect(200);
    expect(res.body.cinemas).toHaveLength(1);
    expect(res.body.cinemas[0]).toMatchObject({ id: cinemaId, slug: cinemaSlug });

    await unsave(alice).expect(204);
    await save(alice, cinemaId).expect(204);
    res = await list(alice).expect(200);
    expect(res.body.cinemas).toHaveLength(1);
  });

  it('is idempotent when the same cinema is saved repeatedly, even at once', async () => {
    await Promise.all([save(alice), save(alice), save(alice), save(alice)]);
    await save(alice).expect(204);

    expect(await prisma.cinemaFavorite.count({ where: { userId: alice.id } })).toBe(1);
  });

  it('removes a cinema, and removing one that was never saved is not an error', async () => {
    await save(alice).expect(204);
    await unsave(alice).expect(204);
    await unsave(alice).expect(204);

    expect((await list(alice).expect(200)).body.cinemas).toEqual([]);
  });

  it('keeps each person’s list to themselves', async () => {
    await save(alice).expect(204);

    expect((await list(bob).expect(200)).body.cinemas).toEqual([]);
    await unsave(bob).expect(204);
    expect((await list(alice).expect(200)).body.cinemas).toHaveLength(1);
  });

  it('lists the most recently saved cinema first', async () => {
    const second = await prisma.cinema.create({
      data: {
        slug: 'test-inox-megaplex',
        name: 'Test INOX Megaplex',
        brand: 'INOX',
        city: 'Mumbai',
        address: '2 Test Road',
        latitude: 19.1,
        longitude: 72.9,
      },
    });
    await save(alice, cinemaSlug).expect(204);
    await new Promise((r) => setTimeout(r, 15));
    await save(alice, second.slug).expect(204);

    const res = await list(alice).expect(200);
    expect(res.body.cinemas.map((c: { slug: string }) => c.slug)).toEqual([
      second.slug,
      cinemaSlug,
    ]);
  });

  it('404s for a cinema that does not exist', async () => {
    await save(alice, 'no-such-cinema').expect(404);
    await unsave(alice, 'no-such-cinema').expect(404);
  });

  it('requires a signed-in user', async () => {
    await request(app).get('/v1/users/me/favorite-cinemas').expect(401);
    await request(app).put(`/v1/users/me/favorite-cinemas/${cinemaSlug}`).expect(401);
    await request(app).delete(`/v1/users/me/favorite-cinemas/${cinemaSlug}`).expect(401);
  });

  it('is removed with the user, not left behind', async () => {
    await save(alice).expect(204);
    await prisma.user.delete({ where: { id: alice.id } });
    expect(await prisma.cinemaFavorite.count()).toBe(0);
  });
});
