import { randomUUID } from 'node:crypto';
import type { SeatTier } from '@prisma/client';
import { prisma } from '../db';
import { signAccessToken } from '../lib/tokens';

/**
 * Fixtures for the booking tests. Deliberately small: a test that needs 2,000
 * seats is testing the renderer, not the mechanic, and the mechanic is what
 * these files are about.
 */

/** Empties every table. Called by each test file's `beforeEach`. */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "WebhookEvent", "IdempotencyRecord", "Payment", "ShowSeat", "Booking",
      "Hold", "ShowtimeTierPrice", "Showtime", "Seat", "Screen", "Cinema",
      "Review", "WatchlistItem", "PromoCode", "ConcessionItem", "Movie",
      "Event",
      "RefreshToken", "User"
    RESTART IDENTITY CASCADE
  `);
}

export interface TestUser {
  id: string;
  email: string;
  token: string;
  /** Ready-to-spread supertest header. */
  auth: { Authorization: string };
}

export async function createUser(label = randomUUID().slice(0, 8)): Promise<TestUser> {
  const email = `${label}@test.local`;
  const user = await prisma.user.create({
    data: { email, name: label, passwordHash: 'not-used-in-these-tests' },
    select: { id: true, email: true },
  });
  const { token } = signAccessToken(user.id);
  return { ...user, token, auth: { Authorization: `Bearer ${token}` } };
}

export async function createUsers(count: number): Promise<TestUser[]> {
  // Sequential on purpose: a burst of inserts here would compete with the
  // pool the test itself needs.
  const users: TestUser[] = [];
  for (let i = 0; i < count; i++) users.push(await createUser(`u${i}-${randomUUID().slice(0, 6)}`));
  return users;
}

export interface TestShowtime {
  showtimeId: string;
  screenId: string;
  /** The film being screened, for tests about reviews rather than seats. */
  movieId: string;
  movieSlug: string;
  /** ShowSeat ids in row-major order, which is what the API expects. */
  showSeatIds: string[];
  seatPriceMinor: number;
}

export async function createShowtime(
  options: {
    seatCount?: number;
    priceMinor?: number;
    tier?: SeatTier;
    /** Minutes from now. Negative closes sales, for the sales-closed test. */
    startsInMinutes?: number;
  } = {},
): Promise<TestShowtime> {
  const seatCount = options.seatCount ?? 10;
  const priceMinor = options.priceMinor ?? 25_000;
  const tier = options.tier ?? 'STANDARD';
  const startsAt = new Date(Date.now() + (options.startsInMinutes ?? 120) * 60_000);

  const suffix = randomUUID().slice(0, 8);
  const movie = await prisma.movie.create({
    data: {
      slug: `test-movie-${suffix}`,
      title: 'Test Movie',
      synopsis: 'A film that exists only to have seats sold for it.',
      posterUrl: 'https://example.test/poster.png',
      durationMins: 120,
      certification: 'UA',
      languages: ['Hindi'],
      genres: ['Drama'],
      releaseDate: new Date(),
    },
  });
  const cinema = await prisma.cinema.create({
    data: {
      slug: `test-cinema-${suffix}`,
      name: 'Test Cinema',
      brand: 'Test',
      city: 'Testville',
      address: '1 Test Road',
      latitude: 0,
      longitude: 0,
    },
  });
  const screen = await prisma.screen.create({
    data: { cinemaId: cinema.id, name: 'Audi 1', rowCount: 1, columnCount: seatCount },
  });

  await prisma.seat.createMany({
    data: Array.from({ length: seatCount }, (_, i) => ({
      screenId: screen.id,
      rowLabel: 'A',
      number: i + 1,
      rowIndex: 0,
      columnIndex: i,
      tier,
    })),
  });

  const showtime = await prisma.showtime.create({
    data: {
      movieId: movie.id,
      screenId: screen.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 150 * 60_000),
      salesCloseAt: new Date(startsAt.getTime() + 10 * 60_000),
      format: 'TWO_D',
      language: 'Hindi',
      tierPrices: { create: [{ tier, priceMinor }] },
    },
  });

  const seats = await prisma.seat.findMany({
    where: { screenId: screen.id },
    orderBy: { columnIndex: 'asc' },
    select: { id: true },
  });
  await prisma.showSeat.createMany({
    data: seats.map((s) => ({ showtimeId: showtime.id, seatId: s.id, priceMinor })),
  });

  const showSeats = await prisma.showSeat.findMany({
    where: { showtimeId: showtime.id },
    orderBy: { seat: { columnIndex: 'asc' } },
    select: { id: true },
  });

  return {
    showtimeId: showtime.id,
    screenId: screen.id,
    movieId: movie.id,
    movieSlug: movie.slug,
    showSeatIds: showSeats.map((s) => s.id),
    seatPriceMinor: priceMinor,
  };
}

/** A fresh idempotency key. Tests that check replay pass one in explicitly. */
export function idempotencyKey(prefix = 'test'): string {
  return `${prefix}-${randomUUID()}`;
}

/**
 * Forces a hold to look expired without waiting out its TTL. Writes the past
 * directly rather than mocking the clock, because the expiry decision is made
 * in SQL against the database clock and a fake JS timer would not reach it.
 */
export async function expireHold(holdId: string): Promise<void> {
  const past = new Date(Date.now() - 1000);
  await prisma.hold.update({ where: { id: holdId }, data: { expiresAt: past } });
  await prisma.showSeat.updateMany({ where: { holdId }, data: { holdExpiresAt: past } });
}

/** Waits for the mock gateway's asynchronous settlement to land. */
export async function waitFor(
  predicate: () => Promise<boolean>,
  { timeoutMs = 5_000, intervalMs = 20 } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Timed out waiting for condition');
}

export interface TestEventShow {
  eventId: string;
  eventSlug: string;
  showtimeId: string;
  venueId: string;
  city: string;
  /** ShowSeat ids per band, keyed by the band's label. */
  seatsByStand: Record<string, string[]>;
}

/**
 * A ground with named stands at different prices, and one fixture on it.
 *
 * Deliberately tiny — two stands of three seats — because what these tests
 * are about is that a band carries its own name and price through to the
 * ticket, not that a bowl can hold thirty thousand people.
 */
export async function createEventShow(
  options: {
    kind?: 'SPORT' | 'CONCERT' | 'COMEDY' | 'WORKSHOP' | 'THEATRE';
    city?: string;
    startsInMinutes?: number;
    stands?: { tier: SeatTier; label: string; priceMinor: number; seats: number }[];
    isPublished?: boolean;
  } = {},
): Promise<TestEventShow> {
  const suffix = randomUUID().slice(0, 8);
  const city = options.city ?? 'Testville';
  const startsAt = new Date(Date.now() + (options.startsInMinutes ?? 120) * 60_000);
  const stands = options.stands ?? [
    { tier: 'VIP' as SeatTier, label: 'Garware Pavilion', priceMinor: 850_000, seats: 3 },
    { tier: 'GENERAL' as SeatTier, label: 'North Stand', priceMinor: 120_000, seats: 3 },
  ];

  const event = await prisma.event.create({
    data: {
      slug: `test-event-${suffix}`,
      kind: options.kind ?? 'SPORT',
      title: 'Test Fixture',
      tagline: 'A fixture that exists only to have seats sold for it.',
      description: 'Seeded by the test suite.',
      posterUrl: 'https://example.test/event.png',
      durationMins: 180,
      performers: ['Home Side', 'Away Side'],
      organiser: 'Test League',
      highlights: ['Gates open two hours before'],
      tags: ['Cricket'],
      isPublished: options.isPublished ?? true,
    },
  });

  const venue = await prisma.cinema.create({
    data: {
      slug: `test-ground-${suffix}`,
      kind: 'STADIUM',
      name: 'Test Ground',
      brand: 'Test Association',
      city,
      address: '1 Test Road',
      latitude: 0,
      longitude: 0,
    },
  });

  const widest = Math.max(...stands.map((s) => s.seats));
  const screen = await prisma.screen.create({
    data: { cinemaId: venue.id, name: 'Test Ground', rowCount: stands.length, columnCount: widest },
  });

  const showtime = await prisma.showtime.create({
    data: {
      eventId: event.id,
      screenId: screen.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 180 * 60_000),
      salesCloseAt: new Date(startsAt.getTime() + 10 * 60_000),
      language: 'Live',
      tierPrices: {
        create: stands.map((s) => ({ tier: s.tier, priceMinor: s.priceMinor, label: s.label })),
      },
    },
  });

  const seatsByStand: Record<string, string[]> = {};
  for (const [rowIndex, stand] of stands.entries()) {
    const made = [];
    for (let i = 0; i < stand.seats; i += 1) {
      const seat = await prisma.seat.create({
        data: {
          screenId: screen.id,
          rowLabel: `${stand.label.slice(0, 2).toUpperCase()}-A`,
          number: i + 1,
          rowIndex,
          columnIndex: i,
          tier: stand.tier,
        },
      });
      const showSeat = await prisma.showSeat.create({
        data: { showtimeId: showtime.id, seatId: seat.id, priceMinor: stand.priceMinor },
      });
      made.push(showSeat.id);
    }
    seatsByStand[stand.label] = made;
  }

  return {
    eventId: event.id,
    eventSlug: event.slug,
    showtimeId: showtime.id,
    venueId: venue.id,
    city,
    seatsByStand,
  };
}
