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

describe('reviews', () => {
  let show: TestShowtime;
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    await resetDb();
    show = await createShowtime({ seatCount: 4 });
    alice = await createUser('alice');
    bob = await createUser('bob');
  });

  const put = (user: TestUser, body: Record<string, unknown>, slug = show.movieSlug) =>
    request(app).put(`/v1/movies/${slug}/reviews/me`).set(user.auth).send(body);

  const list = (user?: TestUser, query = '') => {
    const req = request(app).get(`/v1/movies/${show.movieSlug}/reviews${query}`);
    return user ? req.set(user.auth) : req;
  };

  it('writes a review and returns it as the author’s own', async () => {
    const res = await put(alice, { rating: 4, body: 'Solid.' }).expect(200);

    expect(res.body).toMatchObject({ rating: 4, body: 'Solid.', mine: true });
    expect(res.body.authorName).toBe('alice');
  });

  // The whole moderation policy: one person, one review. A second write has to
  // move the existing row, not add a second vote to the average.
  it('replaces rather than duplicates when the same person writes again', async () => {
    const first = await put(alice, { rating: 5, body: 'Loved it.' }).expect(200);
    const second = await put(alice, { rating: 2, body: 'On reflection, no.' }).expect(200);

    expect(second.body.id).toBe(first.body.id);

    const res = await list().expect(200);
    expect(res.body.count).toBe(1);
    expect(res.body.average).toBe(2);
    expect(res.body.reviews).toHaveLength(1);
  });

  it('averages across people and rounds to one decimal', async () => {
    await put(alice, { rating: 5 }).expect(200);
    await put(bob, { rating: 4 }).expect(200);
    const carol = await createUser('carol');
    await put(carol, { rating: 5 }).expect(200);

    // 14 / 3 = 4.666…, which must not reach the client as 4.666666666666667.
    const res = await list().expect(200);
    expect(res.body.average).toBe(4.7);
    expect(res.body.count).toBe(3);
  });

  it('reports every star in the breakdown, including the empty ones', async () => {
    await put(alice, { rating: 5 }).expect(200);
    await put(bob, { rating: 5 }).expect(200);

    const res = await list().expect(200);
    expect(res.body.breakdown).toEqual([
      { rating: 5, count: 2 },
      { rating: 4, count: 0 },
      { rating: 3, count: 0 },
      { rating: 2, count: 0 },
      { rating: 1, count: 0 },
    ]);
  });

  it('gives a film nobody has reviewed a null average, not a zero', async () => {
    const res = await list().expect(200);
    expect(res.body).toMatchObject({ average: null, count: 0, reviews: [] });
  });

  it('refuses a rating outside one to five', async () => {
    await put(alice, { rating: 0 }).expect(400);
    await put(alice, { rating: 6 }).expect(400);
    await put(alice, { rating: 3.5 }).expect(400);
    expect(await prisma.review.count()).toBe(0);
  });

  it('treats an empty body as a rating with no words', async () => {
    const res = await put(alice, { rating: 4, body: '   ' }).expect(200);
    expect(res.body.body).toBeNull();
  });

  it('requires a session to write or delete', async () => {
    await request(app)
      .put(`/v1/movies/${show.movieSlug}/reviews/me`)
      .send({ rating: 4 })
      .expect(401);
    await request(app).delete(`/v1/movies/${show.movieSlug}/reviews/me`).expect(401);
  });

  it('marks a review verified only when the author actually booked the film', async () => {
    const unverified = await put(alice, { rating: 4 }).expect(200);
    expect(unverified.body.verified).toBe(false);

    await confirmBookingFor(bob, show);
    const verified = await put(bob, { rating: 5 }).expect(200);
    expect(verified.body.verified).toBe(true);
  });

  // A badge earned after the first draft should appear on the next edit, which
  // is the only moment the flag is recomputed.
  it('upgrades an existing review to verified once the author books', async () => {
    await put(alice, { rating: 4 }).expect(200);
    await confirmBookingFor(alice, show);

    const edited = await put(alice, { rating: 5 }).expect(200);
    expect(edited.body.verified).toBe(true);
  });

  it('hoists the caller’s own review even when a star filter excludes it', async () => {
    await put(alice, { rating: 1 }).expect(200);
    await put(bob, { rating: 5 }).expect(200);

    const res = await list(alice, '?rating=5').expect(200);
    expect(res.body.reviews.map((r: { rating: number }) => r.rating)).toEqual([5]);
    expect(res.body.mine).toMatchObject({ rating: 1, mine: true });
  });

  it('flags nothing as mine for a signed-out reader', async () => {
    await put(alice, { rating: 4 }).expect(200);

    const res = await list().expect(200);
    expect(res.body.canReview).toBe(false);
    expect(res.body.mine).toBeNull();
    expect(res.body.reviews[0].mine).toBe(false);
  });

  it('sorts verified reviews first by default', async () => {
    await put(alice, { rating: 3 }).expect(200);
    await confirmBookingFor(bob, show);
    await put(bob, { rating: 3 }).expect(200);

    const res = await list().expect(200);
    expect(res.body.reviews.map((r: { verified: boolean }) => r.verified)).toEqual([true, false]);
  });

  it('sorts by rating on request', async () => {
    await put(alice, { rating: 1 }).expect(200);
    await put(bob, { rating: 5 }).expect(200);

    const high = await list(undefined, '?sort=highest').expect(200);
    expect(high.body.reviews.map((r: { rating: number }) => r.rating)).toEqual([5, 1]);

    const low = await list(undefined, '?sort=lowest').expect(200);
    expect(low.body.reviews.map((r: { rating: number }) => r.rating)).toEqual([1, 5]);
  });

  it('deletes only the caller’s own review', async () => {
    await put(alice, { rating: 4 }).expect(200);
    await put(bob, { rating: 2 }).expect(200);

    await request(app)
      .delete(`/v1/movies/${show.movieSlug}/reviews/me`)
      .set(alice.auth)
      .expect(204);

    const res = await list().expect(200);
    expect(res.body.count).toBe(1);
    expect(res.body.reviews[0].authorName).toBe('bob');
  });

  it('404s when deleting a review that was never written', async () => {
    await request(app)
      .delete(`/v1/movies/${show.movieSlug}/reviews/me`)
      .set(alice.auth)
      .expect(404);
  });

  it('404s for a film that does not exist', async () => {
    await request(app).get('/v1/movies/no-such-film/reviews').expect(404);
    await put(alice, { rating: 4 }, 'no-such-film').expect(404);
  });

  it('carries the rating into the movie payloads the catalogue serves', async () => {
    await put(alice, { rating: 5 }).expect(200);
    await put(bob, { rating: 4 }).expect(200);

    const detail = await request(app).get(`/v1/movies/${show.movieSlug}`).expect(200);
    expect(detail.body.rating).toEqual({ average: 4.5, count: 2 });
    expect(detail.body.ratingBreakdown).toContainEqual({ rating: 5, count: 1 });

    const listed = await request(app).get('/v1/movies').expect(200);
    const movie = listed.body.movies.find((m: { id: string }) => m.id === show.movieId);
    expect(movie.rating).toEqual({ average: 4.5, count: 2 });
  });
});

/**
 * Gives a user a confirmed booking for the film, which is what earns the
 * "verified" badge. Written directly rather than driven through the whole
 * checkout: this file is about reviews, and the booking pipeline has its own
 * tests.
 */
async function confirmBookingFor(user: TestUser, show: TestShowtime): Promise<void> {
  const hold = await prisma.hold.create({
    data: {
      showtimeId: show.showtimeId,
      userId: user.id,
      status: 'CONVERTED',
      expiresAt: new Date(Date.now() + 60_000),
      seatCount: 1,
      subtotalMinor: show.seatPriceMinor,
    },
  });
  await prisma.booking.create({
    data: {
      reference: `BK-${user.id.slice(0, 6).toUpperCase()}`,
      showtimeId: show.showtimeId,
      userId: user.id,
      holdId: hold.id,
      status: 'CONFIRMED',
      subtotalMinor: show.seatPriceMinor,
      feeMinor: 0,
      totalMinor: show.seatPriceMinor,
      confirmedAt: new Date(),
    },
  });
}
