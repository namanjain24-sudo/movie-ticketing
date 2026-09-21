import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
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

describe('watchlist', () => {
  let show: TestShowtime;
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    await resetDb();
    show = await createShowtime({ seatCount: 2 });
    alice = await createUser('alice');
    bob = await createUser('bob');
  });

  const save = (user: TestUser, movie = show.movieSlug) =>
    request(app).put(`/v1/users/me/watchlist/${movie}`).set(user.auth);
  const unsave = (user: TestUser, movie = show.movieSlug) =>
    request(app).delete(`/v1/users/me/watchlist/${movie}`).set(user.auth);
  const list = (user: TestUser) => request(app).get('/v1/users/me/watchlist').set(user.auth);

  it('starts empty', async () => {
    const res = await list(alice).expect(200);
    expect(res.body.movies).toEqual([]);
  });

  it('saves a film by slug and by id', async () => {
    await save(alice).expect(204);
    let res = await list(alice).expect(200);
    expect(res.body.movies).toHaveLength(1);
    expect(res.body.movies[0]).toMatchObject({ id: show.movieId, slug: show.movieSlug });
    expect(res.body.movies[0].rating).toEqual({ average: null, count: 0 });

    await unsave(alice).expect(204);
    await save(alice, show.movieId).expect(204);
    res = await list(alice).expect(200);
    expect(res.body.movies).toHaveLength(1);
  });

  // The composite key is the policy: two taps must never make two rows.
  it('is idempotent when the same film is saved repeatedly, even at once', async () => {
    await Promise.all([save(alice), save(alice), save(alice), save(alice)]);
    await save(alice).expect(204);

    expect(await prisma.watchlistItem.count({ where: { userId: alice.id } })).toBe(1);
  });

  it('removes a film, and removing one that was never saved is not an error', async () => {
    await save(alice).expect(204);
    await unsave(alice).expect(204);
    await unsave(alice).expect(204);

    const res = await list(alice).expect(200);
    expect(res.body.movies).toEqual([]);
  });

  it('keeps each person’s list to themselves', async () => {
    await save(alice).expect(204);

    expect((await list(bob).expect(200)).body.movies).toEqual([]);

    // Bob removing it must not touch Alice's copy.
    await unsave(bob).expect(204);
    expect((await list(alice).expect(200)).body.movies).toHaveLength(1);
  });

  it('lists the most recently saved film first', async () => {
    const second = await createShowtime({ seatCount: 2 });
    await save(alice, show.movieSlug).expect(204);
    await new Promise((r) => setTimeout(r, 15));
    await save(alice, second.movieSlug).expect(204);

    const res = await list(alice).expect(200);
    expect(res.body.movies.map((m: { slug: string }) => m.slug)).toEqual([
      second.movieSlug,
      show.movieSlug,
    ]);
  });

  it('includes the film’s rating', async () => {
    await request(app)
      .put(`/v1/movies/${show.movieSlug}/reviews/me`)
      .set(bob.auth)
      .send({ rating: 4 })
      .expect(200);
    await save(alice).expect(204);

    const res = await list(alice).expect(200);
    expect(res.body.movies[0].rating).toEqual({ average: 4, count: 1 });
  });

  it('404s for a film that does not exist', async () => {
    await save(alice, 'no-such-film').expect(404);
    await unsave(alice, 'no-such-film').expect(404);
  });

  it('requires a signed-in user', async () => {
    await request(app).get('/v1/users/me/watchlist').expect(401);
    await request(app).put(`/v1/users/me/watchlist/${show.movieSlug}`).expect(401);
    await request(app).delete(`/v1/users/me/watchlist/${show.movieSlug}`).expect(401);
  });

  it('is removed with the user, not left behind', async () => {
    await save(alice).expect(204);
    await prisma.user.delete({ where: { id: alice.id } });
    expect(await prisma.watchlistItem.count()).toBe(0);
  });
});
