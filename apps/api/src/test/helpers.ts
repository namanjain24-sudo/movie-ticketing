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
