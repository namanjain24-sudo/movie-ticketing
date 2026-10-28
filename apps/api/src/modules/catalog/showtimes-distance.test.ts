import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { prisma } from '../../db';
import { createShowtime, resetDb } from '../../test/helpers';

const app = createApp();

/** Real places, so the kilometres between them are checkable by hand. */
const COLABA = { lat: 18.922, lng: 72.8347 };
const LOWER_PAREL = { lat: 19.0064, lng: 72.8258 };
const KOLKATA = { lat: 22.5392, lng: 88.3665 };

/**
 * One film, three cinemas, named so that alphabetical order and distance
 * order disagree: the nearest is "Z", the furthest is "A".
 *
 * That disagreement is the whole point. The directory has sorted by distance
 * since it existed; this list — the one on a film's page, where somebody is
 * deciding *where* to go — came back alphabetically, so whichever chain began
 * with A was the first thing offered on every film page in the country and
 * the cinema at the end of the road was somewhere in the middle.
 */
async function threeCinemasOneFilm() {
  const near = await createShowtime();
  const middle = await createShowtime();
  const far = await createShowtime();

  const place = async (made: Awaited<ReturnType<typeof createShowtime>>, name: string, at: { lat: number; lng: number }) => {
    const screen = await prisma.screen.findUniqueOrThrow({
      where: { id: made.screenId },
      select: { cinemaId: true },
    });
    await prisma.cinema.update({
      where: { id: screen.cinemaId },
      data: { name, city: 'Mumbai', latitude: at.lat, longitude: at.lng },
    });
  };

  await place(near, 'Zed Cinema, Colaba', COLABA);
  await place(middle, 'Middle Cinema, Lower Parel', LOWER_PAREL);
  await place(far, 'Alpha Cinema, Kolkata', KOLKATA);

  // One film across all three, which is what a film page asks for.
  await prisma.showtime.updateMany({
    where: { id: { in: [middle.showtimeId, far.showtimeId] } },
    data: { movieId: near.movieId },
  });

  return near.movieId;
}

const names = (body: { cinemas: { cinema: { name: string } }[] }) =>
  body.cinemas.map((c) => c.cinema.name);

describe('GET /v1/showtimes', () => {
  beforeEach(resetDb);

  it('orders cinemas alphabetically when the caller says nothing about where they are', async () => {
    const movieId = await threeCinemasOneFilm();

    const res = await request(app).get(`/v1/showtimes?movieId=${movieId}`).expect(200);

    expect(names(res.body)).toEqual([
      'Alpha Cinema, Kolkata',
      'Middle Cinema, Lower Parel',
      'Zed Cinema, Colaba',
    ]);
    // And says so rather than guessing a number it cannot know.
    expect(res.body.cinemas.map((c: { cinema: { distanceKm: number | null } }) => c.cinema.distanceKm)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('puts the nearest cinema first once the caller says where they are', async () => {
    const movieId = await threeCinemasOneFilm();

    const res = await request(app)
      .get(`/v1/showtimes?movieId=${movieId}&lat=${COLABA.lat}&lng=${COLABA.lng}`)
      .expect(200);

    // Exactly the reverse of the alphabet, which is why the names were chosen.
    expect(names(res.body)).toEqual([
      'Zed Cinema, Colaba',
      'Middle Cinema, Lower Parel',
      'Alpha Cinema, Kolkata',
    ]);
  });

  it('measures the distance rather than only ordering by it', async () => {
    const movieId = await threeCinemasOneFilm();

    const res = await request(app)
      .get(`/v1/showtimes?movieId=${movieId}&lat=${COLABA.lat}&lng=${COLABA.lng}`)
      .expect(200);

    const [here, acrossTown, acrossTheCountry] = res.body.cinemas.map(
      (c: { cinema: { distanceKm: number } }) => c.cinema.distanceKm,
    );
    expect(here).toBe(0);
    // Colaba to Lower Parel is about nine kilometres as the crow flies.
    expect(acrossTown).toBeGreaterThan(8);
    expect(acrossTown).toBeLessThan(11);
    // Mumbai to Kolkata is about 1,650.
    expect(acrossTheCountry).toBeGreaterThan(1_600);
    expect(acrossTheCountry).toBeLessThan(1_700);
    // Rounded to a tenth, as the directory rounds, so one venue cannot read
    // 3.4 on one screen and 3.37 on another.
    expect(acrossTown).toBe(Math.round(acrossTown * 10) / 10);
  });

  it('ignores a half-given position rather than ordering by half of one', async () => {
    const movieId = await threeCinemasOneFilm();

    const res = await request(app)
      .get(`/v1/showtimes?movieId=${movieId}&lat=${COLABA.lat}`)
      .expect(200);

    expect(names(res.body)[0]).toBe('Alpha Cinema, Kolkata');
    expect(res.body.cinemas[0].cinema.distanceKm).toBeNull();
  });

  it('refuses a position that is not on the planet', async () => {
    const movieId = await threeCinemasOneFilm();
    await request(app).get(`/v1/showtimes?movieId=${movieId}&lat=91&lng=0`).expect(400);
    await request(app).get(`/v1/showtimes?movieId=${movieId}&lat=0&lng=181`).expect(400);
  });
});
