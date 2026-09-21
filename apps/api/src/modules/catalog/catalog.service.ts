import type {
  AvailabilityBand,
  Cinema,
  CinemaDirectoryEntry,
  CinemaShowtimes,
  MovieDetail,
  MovieSummary,
  SeatMap,
  SeatMapSeat,
  ShowFormat,
  SeatTier,
} from '@app/shared';
import { SEAT_TIER_LABELS } from '@app/shared';
import { prisma } from '../../db';
import { env } from '../../env';
import { HttpError } from '../../http/errors';
import { dbNow } from '../../lib/tx';
import { breakdownFor, ratingsFor } from '../reviews/reviews.service';

/**
 * The venue reserved for load testing. Real to the booking mechanic, invisible
 * to the app: it has no address anyone can go to and no city anyone lives in.
 */
const LOAD_TEST_SLUG = 'loadtest-arena';

/** Everything the app needs to place a cinema on a map and open it in one. */
const CINEMA_SELECT = {
  id: true,
  slug: true,
  name: true,
  brand: true,
  city: true,
  address: true,
  latitude: true,
  longitude: true,
  phone: true,
  amenities: true,
} as const;

export async function listMovies(params: {
  city?: string;
  search?: string;
  /** Announced but not yet on sale. Never mixed into the now-showing list. */
  comingSoon?: boolean;
}): Promise<MovieSummary[]> {
  const comingSoon = params.comingSoon === true;
  const movies = await prisma.movie.findMany({
    where: {
      isNowShowing: !comingSoon,
      ...(params.search
        ? { title: { contains: params.search, mode: 'insensitive' as const } }
        : {}),
      ...(params.city && !comingSoon
        ? { showtimes: { some: { screen: { cinema: { city: params.city } } } } }
        : {}),
    },
    // Now showing leads with the newest release; coming soon leads with
    // whatever opens next, which is the only ordering either list can mean.
    orderBy: { releaseDate: comingSoon ? 'asc' : 'desc' },
    select: {
      id: true,
      slug: true,
      title: true,
      posterUrl: true,
      durationMins: true,
      certification: true,
      languages: true,
      genres: true,
      releaseDate: true,
    },
  });

  // One grouped query for the whole page rather than a count per card. A
  // twelve-film grid should not cost twelve round trips to render its stars.
  const ratings = await ratingsFor(movies.map((m) => m.id));

  return movies.map((m) => ({
    ...m,
    releaseDate: m.releaseDate.toISOString(),
    rating: ratings.get(m.id) ?? { average: null, count: 0 },
  }));
}

export async function getMovie(idOrSlug: string): Promise<MovieDetail> {
  const movie = await prisma.movie.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: {
      id: true,
      slug: true,
      title: true,
      synopsis: true,
      posterUrl: true,
      backdropUrl: true,
      durationMins: true,
      certification: true,
      languages: true,
      genres: true,
      releaseDate: true,
    },
  });
  if (!movie) throw HttpError.notFound('That movie is not showing');

  const [formats, ratings, ratingBreakdown] = await Promise.all([
    // Distinct formats across the movie's upcoming shows, for the header.
    prisma.showtime.findMany({
      where: { movieId: movie.id, startsAt: { gte: new Date() } },
      distinct: ['format'],
      select: { format: true },
    }),
    ratingsFor([movie.id]),
    breakdownFor(movie.id),
  ]);

  return {
    ...movie,
    releaseDate: movie.releaseDate.toISOString(),
    formats: formats.map((f) => f.format as ShowFormat),
    rating: ratings.get(movie.id) ?? { average: null, count: 0 },
    ratingBreakdown,
  };
}

/**
 * The cities the city picker offers.
 *
 * The load-test arena is excluded here as it is everywhere else: it is a fixed
 * block of inventory for k6 to hammer, its "city" is the word Testing, and a
 * user who picks it gets one screening of one film in a place that does not
 * exist.
 */
export async function listCities(): Promise<string[]> {
  const rows = await prisma.cinema.findMany({
    where: { slug: { not: LOAD_TEST_SLUG } },
    distinct: ['city'],
    select: { city: true },
    orderBy: { city: 'asc' },
  });
  return rows.map((r) => r.city);
}

/**
 * Showtimes for one movie on one day, grouped by cinema, which is the shape
 * the picker screen renders directly.
 */
export async function listShowtimes(params: {
  movieId?: string;
  city?: string;
  date?: string;
}): Promise<CinemaShowtimes[]> {
  const { start, end } = dayWindow(params.date);

  const showtimes = await prisma.showtime.findMany({
    where: {
      ...(params.movieId ? { movieId: params.movieId } : {}),
      ...(params.city ? { screen: { cinema: { city: params.city } } } : {}),
      startsAt: { gte: start, lt: end },
    },
    orderBy: { startsAt: 'asc' },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      format: true,
      language: true,
      currency: true,
      salesCloseAt: true,
      tierPrices: { select: { priceMinor: true } },
      screen: { select: { cinema: { select: CINEMA_SELECT } } },
      _count: { select: { showSeats: true } },
    },
  });

  if (showtimes.length === 0) return [];

  const availability = await availabilityFor(showtimes.map((s) => s.id));

  const grouped = new Map<string, CinemaShowtimes>();
  for (const s of showtimes) {
    const cinema = s.screen.cinema;
    const entry = grouped.get(cinema.id) ?? { cinema, showtimes: [] };
    entry.showtimes.push({
      id: s.id,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      format: s.format as ShowFormat,
      language: s.language,
      currency: s.currency,
      salesCloseAt: s.salesCloseAt.toISOString(),
      fromPriceMinor: Math.min(...s.tierPrices.map((t) => t.priceMinor)),
      availability: band(availability.get(s.id) ?? 0, s._count.showSeats),
    });
    grouped.set(cinema.id, entry);
  }

  return [...grouped.values()].sort((a, b) => a.cinema.name.localeCompare(b.cinema.name));
}

/**
 * Free-seat counts for a set of showtimes in one query. Expired holds count as
 * free here for the same reason they do everywhere else.
 */
async function availabilityFor(showtimeIds: string[]): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<{ showtimeId: string; free: bigint }[]>`
    SELECT "showtimeId", COUNT(*)::bigint AS free
    FROM "ShowSeat"
    WHERE "showtimeId" = ANY(${showtimeIds}::text[])
      AND (state = 'AVAILABLE' OR (state = 'HELD' AND "holdExpiresAt" <= now()))
    GROUP BY "showtimeId"
  `;
  return new Map(rows.map((r) => [r.showtimeId, Number(r.free)]));
}

function band(free: number, capacity: number): AvailabilityBand {
  if (free === 0) return 'SOLD_OUT';
  const ratio = capacity === 0 ? 0 : free / capacity;
  if (ratio > 0.5) return 'PLENTY';
  if (ratio > 0.15) return 'FILLING';
  return 'ALMOST_FULL';
}

function dayWindow(date?: string): { start: Date; end: Date } {
  if (!date) {
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    return { start: now, end };
  }
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

// ---------------------------------------------------------------------------
// Venue directory
// ---------------------------------------------------------------------------

/** Mean Earth radius in kilometres, the figure the haversine formula wants. */
const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in kilometres.
 *
 * Haversine rather than the flat-Earth approximation: the approximation is
 * fine within a city and wrong by tens of kilometres once the list spans
 * Mumbai to Kolkata, which this one does.
 */
export function distanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * The venue directory: every cinema, what is on there, and how far away it is.
 *
 * Sorted by distance when the caller shares a position and alphabetically
 * otherwise, because "nearest" with no position is not a thing the server can
 * invent and an arbitrary order would look like a broken sort.
 */
export async function listCinemas(params: {
  city?: string;
  brand?: string;
  search?: string;
  lat?: number;
  lng?: number;
}): Promise<CinemaDirectoryEntry[]> {
  const cinemas = await prisma.cinema.findMany({
    where: {
      // The load-test venue is inventory, not a place anyone can go.
      slug: { not: LOAD_TEST_SLUG },
      ...(params.city ? { city: params.city } : {}),
      ...(params.brand ? { brand: params.brand } : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' as const } },
              { address: { contains: params.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    select: { ...CINEMA_SELECT, _count: { select: { screens: true } } },
    orderBy: { name: 'asc' },
  });

  if (cinemas.length === 0) return [];

  // What is actually on at each venue, in one pass rather than per cinema.
  const upcoming = await prisma.showtime.findMany({
    where: {
      startsAt: { gte: new Date() },
      screen: { cinemaId: { in: cinemas.map((c) => c.id) } },
    },
    select: {
      movieId: true,
      screen: { select: { cinemaId: true } },
      tierPrices: { select: { priceMinor: true } },
    },
  });

  const films = new Map<string, Set<string>>();
  const cheapest = new Map<string, number>();
  for (const show of upcoming) {
    const cinemaId = show.screen.cinemaId;
    (films.get(cinemaId) ?? films.set(cinemaId, new Set()).get(cinemaId)!).add(show.movieId);
    for (const price of show.tierPrices) {
      const current = cheapest.get(cinemaId);
      if (current === undefined || price.priceMinor < current)
        cheapest.set(cinemaId, price.priceMinor);
    }
  }

  const origin =
    params.lat !== undefined && params.lng !== undefined
      ? { lat: params.lat, lng: params.lng }
      : null;

  const entries = cinemas.map(({ _count, ...cinema }) => ({
    ...cinema,
    screenCount: _count.screens,
    nowShowingCount: films.get(cinema.id)?.size ?? 0,
    fromPriceMinor: cheapest.get(cinema.id) ?? null,
    distanceKm: origin
      ? Math.round(distanceKm(origin, { lat: cinema.latitude, lng: cinema.longitude }) * 10) / 10
      : null,
  }));

  if (origin) {
    entries.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }
  return entries;
}

export async function getCinema(idOrSlug: string): Promise<Cinema> {
  const cinema = await prisma.cinema.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: CINEMA_SELECT,
  });
  if (!cinema) throw HttpError.notFound('No such cinema');
  return cinema;
}

/** The chains represented in the directory, for the brand filter chips. */
export async function listBrands(): Promise<string[]> {
  const rows = await prisma.cinema.findMany({
    where: { slug: { not: LOAD_TEST_SLUG } },
    distinct: ['brand'],
    select: { brand: true },
    orderBy: { brand: 'asc' },
  });
  return rows.map((r) => r.brand);
}

// ---------------------------------------------------------------------------
// Seat map
// ---------------------------------------------------------------------------

interface SeatMapRow {
  id: string;
  state: 'AVAILABLE' | 'HELD' | 'CONFIRMED' | 'BLOCKED';
  priceMinor: number;
  expired: boolean;
  holderId: string | null;
  rowLabel: string;
  number: number;
  rowIndex: number;
  columnIndex: number;
  tier: SeatTier;
  isAccessible: boolean;
}

/**
 * The whole map in one query. A 2,000 seat auditorium is 2,000 rows, so this
 * is the one read in the system worth writing by hand: the ORM's per-seat
 * relation loading turns it into thousands of queries.
 *
 * Expiry is evaluated in SQL, against the database clock, so a seat whose hold
 * lapsed a second ago already reads as available even though the sweeper has
 * not run.
 */
export async function getSeatMap(params: {
  showtimeId: string;
  userId?: string;
}): Promise<SeatMap> {
  const showtime = await prisma.showtime.findUnique({
    where: { id: params.showtimeId },
    select: {
      id: true,
      startsAt: true,
      format: true,
      currency: true,
      salesCloseAt: true,
      movie: { select: { id: true, title: true, posterUrl: true } },
      tierPrices: { select: { tier: true, priceMinor: true }, orderBy: { priceMinor: 'asc' } },
      screen: {
        select: {
          id: true,
          name: true,
          rowCount: true,
          columnCount: true,
          cinema: { select: { id: true, name: true, city: true } },
        },
      },
    },
  });
  if (!showtime) throw HttpError.notFound('That showtime does not exist');

  const rows = await prisma.$queryRaw<SeatMapRow[]>`
    SELECT
      ss.id,
      ss.state::text AS state,
      ss."priceMinor",
      (ss."holdExpiresAt" IS NOT NULL AND ss."holdExpiresAt" <= now()) AS expired,
      h."userId" AS "holderId",
      s."rowLabel",
      s."number",
      s."rowIndex",
      s."columnIndex",
      s.tier::text AS tier,
      s."isAccessible"
    FROM "ShowSeat" ss
    JOIN "Seat" s ON s.id = ss."seatId"
    LEFT JOIN "Hold" h ON h.id = ss."holdId"
    WHERE ss."showtimeId" = ${params.showtimeId}
    ORDER BY s."rowIndex", s."columnIndex"
  `;

  const now = await dbNow(prisma);

  const seats: SeatMapSeat[] = rows.map((r) => ({
    id: r.id,
    rowLabel: r.rowLabel,
    number: r.number,
    x: r.columnIndex,
    y: r.rowIndex,
    tier: r.tier,
    priceMinor: r.priceMinor,
    accessible: r.isAccessible,
    status: seatStatus(r, params.userId),
  }));

  return {
    showtimeId: showtime.id,
    movie: showtime.movie,
    cinema: showtime.screen.cinema,
    screen: {
      id: showtime.screen.id,
      name: showtime.screen.name,
      rowCount: showtime.screen.rowCount,
      columnCount: showtime.screen.columnCount,
    },
    startsAt: showtime.startsAt.toISOString(),
    format: showtime.format as ShowFormat,
    currency: showtime.currency,
    salesCloseAt: showtime.salesCloseAt.toISOString(),
    maxSeatsPerBooking: env.MAX_SEATS_PER_BOOKING,
    tiers: showtime.tierPrices.map((t) => ({
      tier: t.tier as SeatTier,
      priceMinor: t.priceMinor,
      label: SEAT_TIER_LABELS[t.tier as SeatTier],
    })),
    seats,
    serverTime: now.toISOString(),
  };
}

/**
 * Someone else's hold and an empty seat are both simply "unavailable". Leaking
 * the difference would tell one user what another is doing, and the renderer
 * has no use for it.
 */
function seatStatus(row: SeatMapRow, userId?: string): SeatMapSeat['status'] {
  if (row.state === 'BLOCKED') return 'BLOCKED';
  if (row.state === 'CONFIRMED') return 'SOLD';
  if (row.state === 'HELD' && !row.expired) {
    return userId && row.holderId === userId ? 'HELD_BY_YOU' : 'UNAVAILABLE';
  }
  return 'AVAILABLE';
}
