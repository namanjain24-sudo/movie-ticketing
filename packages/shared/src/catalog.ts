import { z } from 'zod';

export const SEAT_TIERS = ['STANDARD', 'PREMIUM', 'RECLINER'] as const;
export const seatTierSchema = z.enum(SEAT_TIERS);
export type SeatTier = z.infer<typeof seatTierSchema>;

export const SHOW_FORMATS = ['TWO_D', 'THREE_D', 'IMAX', 'FOUR_DX'] as const;
export const showFormatSchema = z.enum(SHOW_FORMATS);
export type ShowFormat = z.infer<typeof showFormatSchema>;

/** Label shown on the seat map legend and the showtime chips. */
export const SHOW_FORMAT_LABELS: Record<ShowFormat, string> = {
  TWO_D: '2D',
  THREE_D: '3D',
  IMAX: 'IMAX',
  FOUR_DX: '4DX',
};

export const SEAT_TIER_LABELS: Record<SeatTier, string> = {
  STANDARD: 'Standard',
  PREMIUM: 'Premium',
  RECLINER: 'Recliner',
};

// ---------------------------------------------------------------------------
// Movies
// ---------------------------------------------------------------------------

/**
 * What a film's reviews add up to. Sent with the film rather than fetched
 * separately, because a poster with no rating on it is the one thing every
 * ticketing app is judged on at a glance.
 *
 * `average` is null when `count` is zero: a film nobody has reviewed does not
 * have an average of 0.0, and rendering one would be a lie about the film.
 */
export const ratingSummarySchema = z.object({
  average: z.number().nullable(),
  count: z.number().int().nonnegative(),
});
export type RatingSummary = z.infer<typeof ratingSummarySchema>;

export const movieSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  posterUrl: z.string(),
  durationMins: z.number().int(),
  certification: z.string(),
  languages: z.array(z.string()),
  genres: z.array(z.string()),
  releaseDate: z.string(),
  rating: ratingSummarySchema,
});
export type MovieSummary = z.infer<typeof movieSummarySchema>;

export const movieDetailSchema = movieSummarySchema.extend({
  synopsis: z.string(),
  backdropUrl: z.string().nullable(),
  /** Formats this movie is currently screening in, across all cinemas. */
  formats: z.array(showFormatSchema),
  /** How many stars each rating got, so the detail screen can draw the spread. */
  ratingBreakdown: z.array(
    z.object({ rating: z.number().int().min(1).max(5), count: z.number().int().nonnegative() }),
  ),
});
export type MovieDetail = z.infer<typeof movieDetailSchema>;

export const movieListQuerySchema = z.object({
  city: z.string().optional(),
  search: z.string().optional(),
  /**
   * Announced but not on sale yet. A separate list rather than a field on the
   * summary, because a film you cannot book belongs in its own section — mixed
   * into now-showing it only produces taps that go nowhere.
   */
  // `optional` wraps the transform rather than following it, so the key itself
  // stays optional: absent means "now showing", which is not the same
  // statement as an explicit false.
  comingSoon: z.optional(z.enum(['true', 'false']).transform((v) => v === 'true')),
});
export type MovieListQuery = z.infer<typeof movieListQuerySchema>;

// ---------------------------------------------------------------------------
// Showtimes
// ---------------------------------------------------------------------------

/**
 * Availability is deliberately a coarse band, not a number. An exact count
 * invites the client to render stale precision, and the count is only true for
 * the instant it was read.
 */
export const AVAILABILITY_BANDS = ['PLENTY', 'FILLING', 'ALMOST_FULL', 'SOLD_OUT'] as const;
export const availabilityBandSchema = z.enum(AVAILABILITY_BANDS);
export type AvailabilityBand = z.infer<typeof availabilityBandSchema>;

export const showtimeSummarySchema = z.object({
  id: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  format: showFormatSchema,
  language: z.string(),
  currency: z.string(),
  salesCloseAt: z.string(),
  fromPriceMinor: z.number().int(),
  availability: availabilityBandSchema,
});
export type ShowtimeSummary = z.infer<typeof showtimeSummarySchema>;

/**
 * A venue, with enough of it to put on a map and to open in a maps app. The
 * coordinate is required rather than optional: a cinema whose location is
 * unknown cannot be shown on the map or sorted by distance, so admitting one
 * into the type would push a null check into every call site for no gain.
 */
export const cinemaSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  /** The chain: PVR, INOX, Cinépolis, or `Independent` for a single screen. */
  brand: z.string(),
  city: z.string(),
  address: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  phone: z.string().nullable(),
  amenities: z.array(z.string()),
});
export type Cinema = z.infer<typeof cinemaSchema>;

export const cinemaShowtimesSchema = z.object({
  cinema: cinemaSchema,
  showtimes: z.array(showtimeSummarySchema),
});
export type CinemaShowtimes = z.infer<typeof cinemaShowtimesSchema>;

/** A cinema in the venue directory, with what it is currently screening. */
export const cinemaDirectoryEntrySchema = cinemaSchema.extend({
  screenCount: z.number().int(),
  /** Distinct films with an upcoming show here. */
  nowShowingCount: z.number().int(),
  /** Cheapest upcoming seat at this venue, or null when nothing is on. */
  fromPriceMinor: z.number().int().nullable(),
  /**
   * Kilometres from the coordinate the caller supplied, absent when they
   * supplied none. Computed server-side so every client sorts identically.
   */
  distanceKm: z.number().nullable(),
});
export type CinemaDirectoryEntry = z.infer<typeof cinemaDirectoryEntrySchema>;

export const cinemaListQuerySchema = z.object({
  city: z.string().optional(),
  brand: z.string().optional(),
  search: z.string().optional(),
  /** Caller's position, for distance and ordering. Both or neither. */
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});
export type CinemaListQuery = z.infer<typeof cinemaListQuerySchema>;

export const showtimeListQuerySchema = z.object({
  movieId: z.string().optional(),
  city: z.string().optional(),
  /** ISO date, `YYYY-MM-DD`, interpreted in the cinema's local day. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional(),
});
export type ShowtimeListQuery = z.infer<typeof showtimeListQuerySchema>;

// ---------------------------------------------------------------------------
// Seat map
// ---------------------------------------------------------------------------

/**
 * What one seat looks like to the renderer. Kept flat and small on purpose:
 * a 2,000 seat map is 2,000 of these over the wire, and the canvas reads them
 * straight into typed arrays.
 */
export const seatMapSeatSchema = z.object({
  /** ShowSeat id. This is what hold requests reference, never the Seat id. */
  id: z.string(),
  rowLabel: z.string(),
  number: z.number().int(),
  /** Grid coordinates. The renderer scales these; it never trusts pixel values. */
  x: z.number().int(),
  y: z.number().int(),
  tier: seatTierSchema,
  priceMinor: z.number().int(),
  accessible: z.boolean(),
  /**
   * Availability as the *viewer* sees it. A seat held by someone else and a
   * seat held by nobody are both simply unavailable; only the holder's own
   * seats come back as `HELD_BY_YOU`.
   */
  status: z.enum(['AVAILABLE', 'UNAVAILABLE', 'HELD_BY_YOU', 'SOLD', 'BLOCKED']),
});
export type SeatMapSeat = z.infer<typeof seatMapSeatSchema>;

export const seatMapSchema = z.object({
  showtimeId: z.string(),
  movie: z.object({ id: z.string(), title: z.string(), posterUrl: z.string() }),
  cinema: z.object({ id: z.string(), name: z.string(), city: z.string() }),
  screen: z.object({
    id: z.string(),
    name: z.string(),
    rowCount: z.number().int(),
    columnCount: z.number().int(),
  }),
  startsAt: z.string(),
  format: showFormatSchema,
  currency: z.string(),
  salesCloseAt: z.string(),
  maxSeatsPerBooking: z.number().int(),
  tiers: z.array(
    z.object({ tier: seatTierSchema, priceMinor: z.number().int(), label: z.string() }),
  ),
  seats: z.array(seatMapSeatSchema),
  /**
   * Server time at the moment the map was built. The client uses this to
   * anchor countdowns rather than trusting the device clock.
   */
  serverTime: z.string(),
});
export type SeatMap = z.infer<typeof seatMapSchema>;

/** One entry in a realtime seat delta. Never the full map. */
export const seatDeltaSchema = z.object({
  showSeatId: z.string(),
  status: z.enum(['AVAILABLE', 'UNAVAILABLE', 'SOLD', 'BLOCKED']),
});
export type SeatDelta = z.infer<typeof seatDeltaSchema>;

export const seatUpdateMessageSchema = z.object({
  type: z.literal('seat.update'),
  showtimeId: z.string(),
  seats: z.array(seatDeltaSchema),
  at: z.string(),
});
export type SeatUpdateMessage = z.infer<typeof seatUpdateMessageSchema>;
