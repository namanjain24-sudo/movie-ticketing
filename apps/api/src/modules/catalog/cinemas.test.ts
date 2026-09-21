import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { prisma } from '../../db';
import { resetDb } from '../../test/helpers';
import { distanceKm } from './catalog.service';

const app = createApp();

/** Coordinates of real places, used because the distances are checkable. */
const BANDRA = { lat: 19.0596, lng: 72.8295 };
const LOWER_PAREL = { lat: 19.0064, lng: 72.8258 };
const KOLKATA = { lat: 22.5392, lng: 88.3665 };

describe('distanceKm', () => {
  it('is zero for a point against itself', () => {
    expect(distanceKm(BANDRA, BANDRA)).toBeCloseTo(0, 6);
  });

  it('is symmetric', () => {
    expect(distanceKm(BANDRA, KOLKATA)).toBeCloseTo(distanceKm(KOLKATA, BANDRA), 9);
  });

  // Bandra to Lower Parel is about six kilometres as the crow flies.
  it('measures a short hop across a city', () => {
    expect(distanceKm(BANDRA, LOWER_PAREL)).toBeGreaterThan(5);
    expect(distanceKm(BANDRA, LOWER_PAREL)).toBeLessThan(7);
  });

  // Mumbai to Kolkata is about 1,650 km. The flat-Earth approximation this
  // formula replaces is wrong by well over a hundred kilometres here, which is
  // the reason the test names the long case as well as the short one.
  it('measures a distance where curvature matters', () => {
    expect(distanceKm(BANDRA, KOLKATA)).toBeGreaterThan(1_600);
    expect(distanceKm(BANDRA, KOLKATA)).toBeLessThan(1_700);
  });
});

describe('cinema directory', () => {
  beforeEach(async () => {
    await resetDb();
    await prisma.cinema.createMany({
      data: [
        {
          slug: 'near-one',
          name: 'Near Cinema',
          brand: 'PVR',
          city: 'Mumbai',
          address: '1 Lower Parel',
          latitude: LOWER_PAREL.lat,
          longitude: LOWER_PAREL.lng,
          amenities: ['IMAX'],
        },
        {
          slug: 'far-one',
          name: 'Far Cinema',
          brand: 'INOX',
          city: 'Kolkata',
          address: '1 Ballygunge',
          latitude: KOLKATA.lat,
          longitude: KOLKATA.lng,
          amenities: [],
        },
        {
          // Inventory for the load test, not a place anyone can go to.
          slug: 'loadtest-arena',
          name: 'Load Test Arena',
          brand: 'Internal',
          city: 'Testing',
          address: 'Reserved for k6 runs',
          latitude: 0,
          longitude: 0,
          amenities: [],
        },
      ],
    });
  });

  const list = (query = '') => request(app).get(`/v1/cinemas${query}`);

  it('lists venues alphabetically when no position is given', async () => {
    const res = await list().expect(200);
    expect(res.body.cinemas.map((c: { slug: string }) => c.slug)).toEqual(['far-one', 'near-one']);
    expect(res.body.cinemas[0].distanceKm).toBeNull();
  });

  it('sorts by distance and reports it when a position is given', async () => {
    const res = await list(`?lat=${BANDRA.lat}&lng=${BANDRA.lng}`).expect(200);

    expect(res.body.cinemas.map((c: { slug: string }) => c.slug)).toEqual(['near-one', 'far-one']);
    expect(res.body.cinemas[0].distanceKm).toBeGreaterThan(5);
    expect(res.body.cinemas[0].distanceKm).toBeLessThan(7);
  });

  it('rounds distance to a tenth of a kilometre', async () => {
    const res = await list(`?lat=${BANDRA.lat}&lng=${BANDRA.lng}`).expect(200);
    for (const cinema of res.body.cinemas) {
      expect(cinema.distanceKm * 10).toBeCloseTo(Math.round(cinema.distanceKm * 10), 9);
    }
  });

  // It is real inventory to the booking mechanic and must stay invisible to
  // the app: no pin on the map, no chain in the filter, and above all no
  // "Testing" sitting in the city picker between Pune and nothing.
  it('keeps the load-test venue out of the directory, the brands and the cities', async () => {
    const res = await list().expect(200);
    expect(res.body.cinemas.map((c: { slug: string }) => c.slug)).not.toContain('loadtest-arena');

    const brands = await request(app).get('/v1/cinema-brands').expect(200);
    expect(brands.body.brands).not.toContain('Internal');

    const cities = await request(app).get('/v1/cities').expect(200);
    expect(cities.body.cities).not.toContain('Testing');
    expect(cities.body.cities).toEqual(expect.arrayContaining(['Mumbai', 'Kolkata']));
  });

  it('filters by city and by brand', async () => {
    const byCity = await list('?city=Kolkata').expect(200);
    expect(byCity.body.cinemas.map((c: { slug: string }) => c.slug)).toEqual(['far-one']);

    const byBrand = await list('?brand=PVR').expect(200);
    expect(byBrand.body.cinemas.map((c: { slug: string }) => c.slug)).toEqual(['near-one']);
  });

  it('searches name and address, ignoring case', async () => {
    expect((await list('?search=near').expect(200)).body.cinemas).toHaveLength(1);
    expect((await list('?search=BALLYGUNGE').expect(200)).body.cinemas).toHaveLength(1);
  });

  it('rejects a coordinate that is not on Earth', async () => {
    await list('?lat=91&lng=0').expect(400);
    await list('?lat=0&lng=181').expect(400);
  });

  it('serves one venue by slug, and 404s for an unknown one', async () => {
    const res = await request(app).get('/v1/cinemas/near-one').expect(200);
    expect(res.body).toMatchObject({ name: 'Near Cinema', brand: 'PVR', amenities: ['IMAX'] });
    await request(app).get('/v1/cinemas/no-such-venue').expect(404);
  });
});
