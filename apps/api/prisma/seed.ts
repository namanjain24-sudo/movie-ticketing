import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SeatTier } from '@prisma/client';
import bcrypt from 'bcryptjs';
import type { CatalogueEntry } from '../src/scripts/fetch-catalogue';
// The application's own client, so the seed connects through the same adapter
// and pool configuration the API uses rather than a second, divergent setup.
import { prisma } from '../src/db';

/**
 * Seed data shaped like real cinemas, because the seat map is judged on how it
 * looks and a perfect rectangle of identical seats does not exercise it. Rows
 * are staggered, aisles are real gaps, tiers sit in bands, and one auditorium
 * is deliberately large enough to be the performance target.
 */

// No I or O: they read as 1 and 0 on a printed ticket.
const ROW_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split('');

/** A, B, ... Z, AA, AB, ... so a 34-row house does not reuse a label. */
function rowLabelFor(index: number): string {
  const base = ROW_ALPHABET.length;
  const letter = (i: number) => ROW_ALPHABET[i % base] ?? 'Z';
  if (index < base) return letter(index);
  return `${letter(Math.floor(index / base) - 1)}${letter(index)}`;
}

interface LayoutSpec {
  rows: number;
  /** Seats in the widest row. Front rows taper in from this. */
  maxSeatsPerRow: number;
  /** Column indices left empty as walkways. */
  aisleColumns: number[];
  /** Fraction of rows, front to back, in each tier. */
  tierBands: { tier: SeatTier; upto: number }[];
  /** Set for the load-test screen, whose seat count must be an exact number. */
  noTaper?: boolean;
}

interface GeneratedSeat {
  rowLabel: string;
  number: number;
  rowIndex: number;
  columnIndex: number;
  tier: SeatTier;
  isAccessible: boolean;
}

function generateLayout(spec: LayoutSpec): {
  seats: GeneratedSeat[];
  rowCount: number;
  columnCount: number;
} {
  const seats: GeneratedSeat[] = [];
  const columnCount = spec.maxSeatsPerRow + spec.aisleColumns.length;

  for (let rowIndex = 0; rowIndex < spec.rows; rowIndex++) {
    const rowLabel = rowLabelFor(rowIndex);
    const progress = rowIndex / Math.max(1, spec.rows - 1);

    // Front rows are narrower, the way a real auditorium tapers towards the
    // screen. Two seats per row for the first quarter of the room.
    const taper = !spec.noTaper && progress < 0.25 ? Math.round((0.25 - progress) * 12) : 0;
    const seatsInRow = spec.maxSeatsPerRow - taper * 2;
    const leftPad = Math.floor((columnCount - (seatsInRow + spec.aisleColumns.length)) / 2);

    const tier =
      spec.tierBands.find((b) => progress <= b.upto)?.tier ??
      spec.tierBands[spec.tierBands.length - 1]?.tier ??
      'STANDARD';

    let seatNumber = 1;
    let column = leftPad;
    while (seatNumber <= seatsInRow) {
      if (spec.aisleColumns.includes(column)) {
        column++;
        continue;
      }
      seats.push({
        rowLabel,
        number: seatNumber,
        rowIndex,
        columnIndex: column,
        tier,
        // The two aisle-side seats of the last row, which is how accessible
        // seating is actually laid out.
        isAccessible: rowIndex === spec.rows - 1 && (seatNumber === 1 || seatNumber === seatsInRow),
      });
      seatNumber++;
      column++;
    }
  }

  return { seats, rowCount: spec.rows, columnCount };
}

const TIER_PRICES = {
  standard: { STANDARD: 22_000, PREMIUM: 34_000, RECLINER: 55_000 },
  premium: { STANDARD: 30_000, PREMIUM: 45_000, RECLINER: 75_000 },
  imax: { STANDARD: 45_000, PREMIUM: 65_000, RECLINER: 95_000 },
} satisfies Record<string, Record<SeatTier, number>>;

/**
 * Real films, with their synopses and posters fetched once by
 * `npm run catalogue --workspace @app/api` and cached to `catalogue.json`.
 *
 * Read from the cache rather than the network so seeding is reproducible and
 * works offline. Everything *around* the films — the showtimes, the pricing,
 * the cinemas — is synthetic demo data.
 */
const catalogue = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'catalogue.json'), 'utf8'),
) as {
  fetchedAt: string;
  nowShowing: CatalogueEntry[];
  comingSoon: CatalogueEntry[];
};

const MOVIES = catalogue.nowShowing;

/** Demo run dates, offset from whenever the seed happens to run. */
function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

/**
 * Announced but not yet on sale. They deliberately get no showtimes: the point
 * of the section is a film you cannot book yet, and inventing screenings for
 * it would make "Coming soon" indistinguishable from "Now showing".
 */
const UPCOMING = catalogue.comingSoon;

/**
 * Auditorium shapes, named rather than repeated. A multiplex screen is not a
 * bespoke object: chains build a handful of room types and reuse them, so the
 * seed does too.
 */
const LAYOUTS = {
  /// The performance target: 34 rows, 62 wide, two aisles. One of these per
  /// flagship venue, the way real IMAX houses are distributed.
  imax: {
    rows: 34,
    maxSeatsPerRow: 62,
    aisleColumns: [20, 43],
    tierBands: [
      { tier: 'STANDARD' as SeatTier, upto: 0.45 },
      { tier: 'PREMIUM' as SeatTier, upto: 0.85 },
      { tier: 'RECLINER' as SeatTier, upto: 1 },
    ],
  },
  /// A heritage single screen: wide, deep, no recliners, because these rooms
  /// were built before recliners existed.
  heritage: {
    rows: 18,
    maxSeatsPerRow: 30,
    aisleColumns: [10, 21],
    tierBands: [
      { tier: 'STANDARD' as SeatTier, upto: 0.65 },
      { tier: 'PREMIUM' as SeatTier, upto: 1 },
    ],
  },
  /// The ordinary mall multiplex auditorium.
  multiplex: {
    rows: 13,
    maxSeatsPerRow: 22,
    aisleColumns: [11],
    tierBands: [
      { tier: 'STANDARD' as SeatTier, upto: 0.5 },
      { tier: 'PREMIUM' as SeatTier, upto: 0.85 },
      { tier: 'RECLINER' as SeatTier, upto: 1 },
    ],
  },
  /// A smaller room off the same foyer.
  compact: {
    rows: 11,
    maxSeatsPerRow: 18,
    aisleColumns: [9],
    tierBands: [
      { tier: 'STANDARD' as SeatTier, upto: 0.6 },
      { tier: 'PREMIUM' as SeatTier, upto: 1 },
    ],
  },
  /// All-recliner boutique screen. Few seats, every one of them expensive.
  lounge: {
    rows: 8,
    maxSeatsPerRow: 10,
    aisleColumns: [5],
    tierBands: [{ tier: 'RECLINER' as SeatTier, upto: 1 }],
  },
} satisfies Record<string, LayoutSpec>;

/**
 * Real venues, in the cities this app is for.
 *
 * Names, chains and street addresses are the actual ones. Coordinates are the
 * venue's location to roughly building precision — good enough to drop a pin
 * and to sort by distance, and not claimed to be more than that. Everything
 * else here — the screens, the showtimes, the prices — is demo data.
 */
const CINEMAS = [
  // --- Mumbai --------------------------------------------------------------
  {
    slug: 'pvr-icon-phoenix-lower-parel',
    name: 'PVR ICON, Phoenix Palladium',
    brand: 'PVR',
    city: 'Mumbai',
    address: '462 Senapati Bapat Marg, Lower Parel, Mumbai 400013',
    latitude: 19.0064,
    longitude: 72.8258,
    phone: '+91 22 6180 2222',
    amenities: ['IMAX', 'Dolby Atmos', 'Recliners', 'Valet parking', 'Food court'],
    screens: [
      { name: 'IMAX', pricing: 'imax' as const, layout: LAYOUTS.imax },
      { name: 'Audi 2', pricing: 'premium' as const, layout: LAYOUTS.multiplex },
    ],
  },
  {
    slug: 'inox-cr2-nariman-point',
    name: 'INOX CR2, Nariman Point',
    brand: 'INOX',
    city: 'Mumbai',
    address: 'CR2 Mall, 2nd Floor, Barrister Rajni Patel Marg, Nariman Point, Mumbai 400021',
    latitude: 18.9296,
    longitude: 72.8244,
    phone: '+91 22 4030 4030',
    amenities: ['Dolby Atmos', 'Wheelchair access', 'Mall parking'],
    screens: [
      { name: 'Audi 1', pricing: 'standard' as const, layout: LAYOUTS.multiplex },
      { name: 'Audi 2', pricing: 'standard' as const, layout: LAYOUTS.compact },
    ],
  },
  {
    slug: 'cinepolis-fun-republic-andheri',
    name: 'Cinépolis Fun Republic, Andheri West',
    brand: 'Cinépolis',
    city: 'Mumbai',
    address: 'Fun Republic Mall, New Link Road, Andheri West, Mumbai 400053',
    latitude: 19.1367,
    longitude: 72.8317,
    phone: '+91 22 6726 0000',
    amenities: ['4DX', 'Recliners', 'Dolby Atmos'],
    screens: [{ name: 'Audi 1', pricing: 'premium' as const, layout: LAYOUTS.multiplex }],
  },
  {
    slug: 'regal-cinema-colaba',
    name: 'Regal Cinema, Colaba',
    brand: 'Independent',
    city: 'Mumbai',
    address: 'Shahid Bhagat Singh Road, Colaba Causeway, Mumbai 400039',
    latitude: 18.9227,
    longitude: 72.8329,
    phone: '+91 22 2202 1017',
    amenities: ['Art deco heritage building', 'Balcony seating'],
    screens: [{ name: 'Grand Circle', pricing: 'standard' as const, layout: LAYOUTS.heritage }],
  },

  // --- Delhi ---------------------------------------------------------------
  {
    slug: 'pvr-select-citywalk-saket',
    name: 'PVR Select Citywalk, Saket',
    brand: 'PVR',
    city: 'Delhi',
    address: 'Select Citywalk, A-3 District Centre, Saket, New Delhi 110017',
    latitude: 28.5286,
    longitude: 77.2192,
    phone: '+91 11 4059 1111',
    amenities: ['Gold Class', 'Dolby Atmos', 'Recliners', 'Mall parking'],
    screens: [
      { name: 'Audi 1', pricing: 'premium' as const, layout: LAYOUTS.multiplex },
      { name: 'Gold Class', pricing: 'imax' as const, layout: LAYOUTS.lounge },
    ],
  },
  {
    slug: 'pvr-directors-cut-vasant-kunj',
    name: "PVR Director's Cut, Ambience Mall",
    brand: 'PVR',
    city: 'Delhi',
    address: 'Ambience Mall, Nelson Mandela Marg, Vasant Kunj, New Delhi 110070',
    latitude: 28.5409,
    longitude: 77.1553,
    phone: '+91 11 4087 7777',
    amenities: ['Director’s Cut lounge', 'À la carte dining', 'Recliners', 'Valet parking'],
    screens: [{ name: "Director's Cut", pricing: 'imax' as const, layout: LAYOUTS.lounge }],
  },
  {
    slug: 'delite-cinema-asaf-ali-road',
    name: 'Delite Cinema, Asaf Ali Road',
    brand: 'Independent',
    city: 'Delhi',
    address: '4/1 Asaf Ali Road, New Delhi 110002',
    latitude: 28.6408,
    longitude: 77.2372,
    phone: '+91 11 2327 2903',
    amenities: ['Single screen landmark', 'Balcony seating', 'Dolby Atmos'],
    screens: [{ name: 'Delite Grand', pricing: 'standard' as const, layout: LAYOUTS.heritage }],
  },

  // --- Bengaluru -----------------------------------------------------------
  {
    slug: 'cinepolis-nexus-koramangala',
    name: 'Cinépolis Nexus, Koramangala',
    brand: 'Cinépolis',
    city: 'Bengaluru',
    address: 'Nexus Koramangala, 21 ITPL Main Road, Koramangala, Bengaluru 560095',
    latitude: 12.9345,
    longitude: 77.6113,
    phone: '+91 80 4123 4123',
    amenities: ['Recliners', 'Dolby Atmos', 'Mall parking'],
    screens: [{ name: 'Audi 1', pricing: 'premium' as const, layout: LAYOUTS.multiplex }],
  },
  {
    slug: 'pvr-orion-rajajinagar',
    name: 'PVR Orion Mall, Rajajinagar',
    brand: 'PVR',
    city: 'Bengaluru',
    address: 'Orion Mall, Dr Rajkumar Road, Rajajinagar, Bengaluru 560055',
    latitude: 13.011,
    longitude: 77.5551,
    phone: '+91 80 6726 4000',
    amenities: ['Dolby Atmos', 'Recliners', 'Food court'],
    screens: [{ name: 'Audi 3', pricing: 'premium' as const, layout: LAYOUTS.multiplex }],
  },
  {
    slug: 'inox-garuda-magrath-road',
    name: 'INOX Garuda Mall, Magrath Road',
    brand: 'INOX',
    city: 'Bengaluru',
    address: 'Garuda Mall, Magrath Road, Ashok Nagar, Bengaluru 560025',
    latitude: 12.9666,
    longitude: 77.6072,
    phone: '+91 80 4112 6000',
    amenities: ['Wheelchair access', 'Mall parking'],
    screens: [{ name: 'Audi 2', pricing: 'standard' as const, layout: LAYOUTS.compact }],
  },

  // --- Hyderabad -----------------------------------------------------------
  {
    slug: 'amb-cinemas-gachibowli',
    name: 'AMB Cinemas, Gachibowli',
    brand: 'AMB',
    city: 'Hyderabad',
    address: 'Sarath City Capital Mall, Gachibowli, Hyderabad 500032',
    latitude: 17.4556,
    longitude: 78.3546,
    phone: '+91 40 4855 5555',
    amenities: ['Dolby Atmos', 'Recliners', 'Gourmet concessions', 'Valet parking'],
    screens: [{ name: 'Audi 1', pricing: 'premium' as const, layout: LAYOUTS.multiplex }],
  },
  {
    slug: 'prasads-imax-necklace-road',
    name: 'Prasads IMAX, Necklace Road',
    brand: 'Prasads',
    city: 'Hyderabad',
    address: 'NTR Marg, Khairatabad, Hyderabad 500063',
    latitude: 17.4141,
    longitude: 78.4649,
    phone: '+91 40 2323 0473',
    amenities: ['IMAX', 'Dolby Atmos', 'Lakefront location', 'Parking'],
    screens: [{ name: 'IMAX', pricing: 'imax' as const, layout: LAYOUTS.imax }],
  },

  // --- Chennai -------------------------------------------------------------
  {
    slug: 'pvr-sathyam-royapettah',
    name: 'PVR Sathyam, Royapettah',
    brand: 'PVR',
    city: 'Chennai',
    address: '8 Thiru Vi Ka Road, Royapettah, Chennai 600014',
    latitude: 13.0562,
    longitude: 80.2616,
    phone: '+91 44 4224 4224',
    amenities: ['Dolby Atmos', 'Legendary concessions', 'Wheelchair access'],
    screens: [
      { name: 'Sathyam', pricing: 'premium' as const, layout: LAYOUTS.heritage },
      { name: 'Serene', pricing: 'standard' as const, layout: LAYOUTS.compact },
    ],
  },
  {
    slug: 'luxe-phoenix-velachery',
    name: 'Luxe Cinemas, Phoenix MarketCity',
    brand: 'Luxe',
    city: 'Chennai',
    address: 'Phoenix MarketCity, 142 Velachery Main Road, Velachery, Chennai 600042',
    latitude: 12.9915,
    longitude: 80.2176,
    phone: '+91 44 4224 5000',
    amenities: ['Recliners', 'Dolby Atmos', 'Mall parking'],
    screens: [{ name: 'Luxe 1', pricing: 'premium' as const, layout: LAYOUTS.compact }],
  },

  // --- Pune ----------------------------------------------------------------
  {
    slug: 'pvr-phoenix-viman-nagar',
    name: 'PVR Phoenix Marketcity, Viman Nagar',
    brand: 'PVR',
    city: 'Pune',
    address: 'Phoenix Marketcity, 207 Nagar Road, Viman Nagar, Pune 411014',
    latitude: 18.562,
    longitude: 73.9167,
    phone: '+91 20 6720 6720',
    amenities: ['Dolby Atmos', 'Recliners', 'Food court', 'Mall parking'],
    screens: [{ name: 'Audi 4', pricing: 'premium' as const, layout: LAYOUTS.multiplex }],
  },
  {
    slug: 'inox-bund-garden',
    name: 'INOX Bund Garden Road',
    brand: 'INOX',
    city: 'Pune',
    address: 'Sunderban, Bund Garden Road, Pune 411001',
    latitude: 18.5343,
    longitude: 73.8785,
    phone: '+91 20 6601 6601',
    amenities: ['Dolby Atmos', 'Wheelchair access'],
    screens: [{ name: 'Audi 1', pricing: 'standard' as const, layout: LAYOUTS.compact }],
  },

  // --- Kolkata -------------------------------------------------------------
  {
    slug: 'inox-quest-mall-ballygunge',
    name: 'INOX Quest Mall, Ballygunge',
    brand: 'INOX',
    city: 'Kolkata',
    address: 'Quest Mall, 33 Syed Amir Ali Avenue, Ballygunge, Kolkata 700017',
    latitude: 22.5392,
    longitude: 88.3665,
    phone: '+91 33 4040 4040',
    amenities: ['Insignia', 'Dolby Atmos', 'Recliners', 'Mall parking'],
    screens: [{ name: 'Audi 2', pricing: 'premium' as const, layout: LAYOUTS.compact }],
  },
  {
    slug: 'priya-cinema-deshapriya-park',
    name: 'Priya Cinema, Deshapriya Park',
    brand: 'Independent',
    city: 'Kolkata',
    address: '9 Deshapriya Park East, Rashbehari Avenue, Kolkata 700029',
    latitude: 22.517,
    longitude: 88.3486,
    phone: '+91 33 2464 3555',
    amenities: ['Single screen landmark', 'Balcony seating'],
    screens: [{ name: 'Priya', pricing: 'standard' as const, layout: LAYOUTS.heritage }],
  },
];

/**
 * A small, fixed-inventory auditorium reserved for the load test. The PRD's
 * scenario is 5,000 users against 300 seats, and a dedicated screen keeps that
 * run from disturbing the demo data.
 */
const LOAD_TEST_CINEMA = {
  slug: 'loadtest-arena',
  name: 'Load Test Arena',
  brand: 'Internal',
  city: 'Testing',
  address: 'Reserved for k6 runs',
  // Null Island. The city is already called "Testing"; the coordinate says the
  // same thing to anything that reads coordinates rather than names.
  latitude: 0,
  longitude: 0,
  phone: null,
  amenities: [],
  screen: {
    name: 'Fixed 300',
    pricing: 'standard' as const,
    // 20 rows of 15 is exactly 300 with no taper, so the inventory count in
    // the report is unambiguous.
    layout: {
      rows: 20,
      maxSeatsPerRow: 15,
      aisleColumns: [],
      tierBands: [{ tier: 'STANDARD' as SeatTier, upto: 1 }],
      noTaper: true,
    },
  },
};

/**
 * People who have written a review. Separate from the demo login so the
 * reviews screen has more than one voice on it, and so signing in as the demo
 * user shows an empty "your review" slot rather than someone else's words.
 */
const REVIEWERS = [
  { email: 'aarti@example.com', name: 'Aarti Desai' },
  { email: 'rohan@example.com', name: 'Rohan Mehta' },
  { email: 'fatima@example.com', name: 'Fatima Sheikh' },
  { email: 'vikram@example.com', name: 'Vikram Rao' },
  { email: 'neha@example.com', name: 'Neha Krishnan' },
  { email: 'joseph@example.com', name: 'Joseph Mathew' },
];

/**
 * Review bodies, keyed by how many stars they are worth. Written once and
 * dealt out, because six hundred generated sentences that all say "great film"
 * would test the list's rendering and nothing else — what the screen has to
 * survive is genuine disagreement about the same film.
 */
const REVIEW_BODIES: Record<number, string[]> = {
  5: [
    'Went in with low expectations and came out floored. The interval block alone is worth the ticket.',
    'Third watch and it still holds. Book the recliners, the sound mix deserves them.',
    'The kind of film the big screen was built for. No phone came out in our row the whole time.',
  ],
  4: [
    'Terrific for the first two acts, loses its nerve slightly at the end. Still an easy recommend.',
    'Performances carry it. A good twenty minutes could have come out of the second half.',
    'Loved it. Take the earlier show — the late crowd talked through the quiet stretch.',
  ],
  3: [
    'Watchable, not memorable. The set pieces are strong and everything between them is filler.',
    'Half a great film. The lead is excellent and the script keeps letting them down.',
    'Fine for a weekday evening. Would not pay IMAX prices for it.',
  ],
  2: [
    'Good ideas, badly paced. I checked the time twice before the interval.',
    'The trailer had the best parts in it. Everything else drags.',
  ],
  1: [
    'Two and a half hours I am not getting back. The plot stops making sense after the interval.',
  ],
};

const SHOW_TIMES_OF_DAY = ['10:15', '13:30', '16:45', '20:00', '22:45'];

/** Wrapping index into a non-empty list, without an optional at every use. */
function pick<T>(items: T[], index: number): T {
  const item = items[((index % items.length) + items.length) % items.length];
  if (!item) throw new Error('pick() called on an empty list');
  return item;
}

async function main() {
  console.log('Clearing existing catalogue…');
  // Order matters: children before parents, since some relations restrict.
  await prisma.webhookEvent.deleteMany();
  await prisma.idempotencyRecord.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.showSeat.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.hold.deleteMany();
  await prisma.review.deleteMany();
  await prisma.promoCode.deleteMany();
  await prisma.showtimeTierPrice.deleteMany();
  await prisma.showtime.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.screen.deleteMany();
  await prisma.cinema.deleteMany();
  await prisma.movie.deleteMany();

  console.log('Seeding promo codes…');
  await prisma.promoCode.createMany({
    data: [
      {
        code: 'WELCOME50',
        description: '₹50 off your booking. Minimum ₹200 on seats.',
        kind: 'FLAT',
        value: 5_000,
        minSubtotalMinor: 20_000,
      },
      {
        code: 'MOVIE20',
        description: '20% off seats, up to ₹150.',
        kind: 'PERCENT',
        value: 20,
        maxDiscountMinor: 15_000,
        minSubtotalMinor: 30_000,
        perUserLimit: 3,
      },
      {
        code: 'FAMILY100',
        description: '₹100 off when you book 4 or more seats. Minimum ₹800 on seats.',
        kind: 'FLAT',
        value: 10_000,
        minSubtotalMinor: 80_000,
        perUserLimit: 2,
      },
    ],
  });

  const passwordHash = await bcrypt.hash('DemoPassw0rd', 12);
  const demo = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: { passwordHash },
    create: { email: 'demo@example.com', name: 'Demo User', passwordHash },
  });

  console.log(`Seeding movies from catalogue.json (fetched ${catalogue.fetchedAt})…`);

  const movies = [];
  for (const [index, m] of MOVIES.entries()) {
    // Staggered a few days apart so "now showing" has a real ordering to sort
    // by. The run dates are demo data; the films are not.
    const releaseDate = daysFromNow(-2 - index * 3);
    movies.push(
      await prisma.movie.create({
        data: {
          slug: m.slug,
          title: m.title,
          synopsis: m.synopsis,
          posterUrl: m.posterUrl,
          backdropUrl: m.backdropUrl,
          durationMins: m.durationMins,
          certification: m.certification,
          languages: m.languages,
          genres: m.genres,
          releaseDate,
        },
      }),
    );
  }

  for (const [index, m] of UPCOMING.entries()) {
    await prisma.movie.create({
      data: {
        slug: m.slug,
        title: m.title,
        synopsis: m.synopsis,
        posterUrl: m.posterUrl,
        backdropUrl: m.backdropUrl,
        durationMins: m.durationMins,
        certification: m.certification,
        languages: m.languages,
        genres: m.genres,
        releaseDate: daysFromNow(12 + index * 14),
        isNowShowing: false,
      },
    });
  }

  console.log('Seeding reviews…');
  const reviewers = [];
  for (const r of REVIEWERS) {
    reviewers.push(
      await prisma.user.upsert({
        where: { email: r.email },
        update: { name: r.name, passwordHash },
        create: { email: r.email, name: r.name, passwordHash },
      }),
    );
  }

  let reviewCount = 0;
  for (const [movieIndex, movie] of movies.entries()) {
    // A deterministic spread rather than a random one: the same seed produces
    // the same ratings, so a screenshot taken today matches one taken tomorrow
    // and a failing test is reproducible.
    // One review per person per film is a database constraint, so the walk
    // through the reviewer list has to have stride 1 and stop before it laps.
    const howMany = Math.min(reviewers.length, 3 + ((movieIndex * 2) % 4));
    for (let i = 0; i < howMany; i++) {
      const reviewer = pick(reviewers, movieIndex + i);
      // Ratings lean positive the way real ones do, without being uniform.
      const rating = pick([5, 4, 5, 3, 4, 2, 5, 4, 1, 3], movieIndex * 3 + i);
      const bodies = REVIEW_BODIES[rating] ?? [];
      await prisma.review.create({
        data: {
          movieId: movie.id,
          userId: reviewer.id,
          rating,
          body: pick(bodies, movieIndex + i),
          // Every seeded reviewer is treated as having seen the film. Reviews
          // written through the API earn this flag from a real booking.
          verified: (movieIndex + i) % 3 !== 0,
          createdAt: daysFromNow(-1 - ((movieIndex + i) % 9)),
        },
      });
      reviewCount++;
    }
  }

  console.log('Seeding cinemas and seat layouts…');
  const screens: { id: string; pricing: keyof typeof TIER_PRICES; seatCount: number }[] = [];

  for (const c of CINEMAS) {
    const cinema = await prisma.cinema.create({
      data: {
        slug: c.slug,
        name: c.name,
        brand: c.brand,
        city: c.city,
        address: c.address,
        latitude: c.latitude,
        longitude: c.longitude,
        phone: c.phone,
        amenities: c.amenities,
      },
    });
    for (const s of c.screens) {
      const { seats, rowCount, columnCount } = generateLayout(s.layout);
      const screen = await prisma.screen.create({
        data: { cinemaId: cinema.id, name: s.name, rowCount, columnCount },
      });
      await prisma.seat.createMany({
        data: seats.map((seat) => ({ ...seat, screenId: screen.id })),
      });
      screens.push({ id: screen.id, pricing: s.pricing, seatCount: seats.length });
      console.log(`  ${c.name} / ${s.name}: ${seats.length} seats`);
    }
  }

  const loadCinema = await prisma.cinema.create({
    data: {
      slug: LOAD_TEST_CINEMA.slug,
      name: LOAD_TEST_CINEMA.name,
      brand: LOAD_TEST_CINEMA.brand,
      city: LOAD_TEST_CINEMA.city,
      address: LOAD_TEST_CINEMA.address,
      latitude: LOAD_TEST_CINEMA.latitude,
      longitude: LOAD_TEST_CINEMA.longitude,
      amenities: LOAD_TEST_CINEMA.amenities,
    },
  });
  const loadLayout = generateLayout(LOAD_TEST_CINEMA.screen.layout);
  const loadScreen = await prisma.screen.create({
    data: {
      cinemaId: loadCinema.id,
      name: LOAD_TEST_CINEMA.screen.name,
      rowCount: loadLayout.rowCount,
      columnCount: loadLayout.columnCount,
    },
  });
  await prisma.seat.createMany({
    data: loadLayout.seats.map((seat) => ({ ...seat, screenId: loadScreen.id })),
  });
  console.log(`  ${LOAD_TEST_CINEMA.name}: ${loadLayout.seats.length} seats`);

  console.log('Seeding showtimes…');
  let showtimeCount = 0;
  let showSeatCount = 0;

  for (let day = 0; day < 7; day++) {
    for (const screen of screens) {
      // The 2,000 seat house gets fewer shows: its inventory rows dominate the
      // seed and seven days of five shows would be a quarter of a million rows
      // for no extra demo value.
      const slots = screen.seatCount > 1_000 ? SHOW_TIMES_OF_DAY.slice(0, 2) : SHOW_TIMES_OF_DAY;
      for (const [slotIndex, time] of slots.entries()) {
        const movie = pick(movies, day + slotIndex + screens.indexOf(screen));
        showSeatCount += await createShowtime({
          movieId: movie.id,
          screenId: screen.id,
          pricing: screen.pricing,
          day,
          time,
          durationMins: movie.durationMins,
          format: screen.seatCount > 1_000 ? 'IMAX' : slotIndex % 3 === 0 ? 'THREE_D' : 'TWO_D',
          language: movie.languages[0] ?? 'Hindi',
        });
        showtimeCount++;
      }
    }
  }

  // One showtime far enough ahead that a load test never trips the sales
  // cutoff, on the fixed-inventory screen.
  const loadMovie = pick(movies, 0);
  showSeatCount += await createShowtime({
    movieId: loadMovie.id,
    screenId: loadScreen.id,
    pricing: LOAD_TEST_CINEMA.screen.pricing,
    day: 1,
    time: '19:00',
    durationMins: loadMovie.durationMins,
    format: 'TWO_D',
    language: 'Hindi',
  });
  showtimeCount++;

  const loadShowtime = await prisma.showtime.findFirst({
    where: { screenId: loadScreen.id },
    select: { id: true },
  });

  console.log('');
  console.log(
    `Seeded ${movies.length} movies now showing, ${UPCOMING.length} coming soon, ` +
      `${screens.length + 1} screens,`,
  );
  console.log(`        ${showtimeCount} showtimes, ${showSeatCount} seat inventory rows`);
  console.log(
    `        ${CINEMAS.length} cinemas across ${new Set(CINEMAS.map((c) => c.city)).size} cities, ${reviewCount} reviews`,
  );
  console.log(`Demo login: ${demo.email} / DemoPassw0rd`);
  console.log(`Load-test showtime id: ${loadShowtime?.id}`);
}

async function createShowtime(input: {
  movieId: string;
  screenId: string;
  pricing: keyof typeof TIER_PRICES;
  day: number;
  time: string;
  durationMins: number;
  format: 'TWO_D' | 'THREE_D' | 'IMAX' | 'FOUR_DX';
  language: string;
}): Promise<number> {
  const [hours = 0, minutes = 0] = input.time.split(':').map(Number);
  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + input.day);
  startsAt.setHours(hours, minutes, 0, 0);

  const endsAt = new Date(startsAt.getTime() + (input.durationMins + 20) * 60_000);
  // Booking stays open until ten minutes after the show starts, the way most
  // chains run it.
  const salesCloseAt = new Date(startsAt.getTime() + 10 * 60_000);

  const prices = TIER_PRICES[input.pricing];

  const showtime = await prisma.showtime.create({
    data: {
      movieId: input.movieId,
      screenId: input.screenId,
      startsAt,
      endsAt,
      salesCloseAt,
      format: input.format,
      language: input.language,
      tierPrices: {
        create: (Object.keys(prices) as SeatTier[]).map((tier) => ({
          tier,
          priceMinor: prices[tier],
        })),
      },
    },
    select: { id: true },
  });

  const seats = await prisma.seat.findMany({
    where: { screenId: input.screenId },
    select: { id: true, tier: true },
  });

  // Inventory is materialised up front rather than created on demand. A seat
  // row that does not exist cannot be locked, and lazily creating it during a
  // booking would reintroduce exactly the race the locks exist to close.
  await prisma.showSeat.createMany({
    data: seats.map((seat) => ({
      showtimeId: showtime.id,
      seatId: seat.id,
      priceMinor: prices[seat.tier],
    })),
  });

  return seats.length;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
