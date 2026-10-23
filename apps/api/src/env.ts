import { z } from 'zod';
import { pinConnectionToUtc } from './lib/database-url';

/**
 * The webhook secret every non-production environment uses. It is in the repo
 * on purpose, and that is exactly why production must never run on it: anyone
 * reading this file could then forge `payment.captured` for a booking they
 * chose the idempotency key for, and the API would confirm the seats and award
 * the points without a rupee moving.
 */
const DEV_WEBHOOK_SECRET = 'mock-webhook-secret-change-me';

/**
 * The process refuses to boot with a bad environment. Failing here is much
 * cheaper than failing on the first request in production.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required').transform(pinConnectionToUtc),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(20),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ORIGINS: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // --- Booking mechanic -----------------------------------------------------
  /// How long a hold survives without payment. Five minutes is the number the
  /// checkout countdown is built around; changing it changes the UI copy too.
  HOLD_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  /// Upper bound on seats in one booking, matching the seat-map selection cap.
  MAX_SEATS_PER_BOOKING: z.coerce.number().int().positive().max(20).default(10),
  /// Upper bound on seats one account may have on hold at once, across every
  /// showtime.
  ///
  /// This is the cap that stops an auditorium being taken hostage, and a
  /// per-request limit cannot do it: at MAX_SEATS_PER_BOOKING seats per
  /// request and RATE_LIMIT_HOLD_PER_MINUTE requests per minute, one account
  /// could put 300 seats a minute on hold and keep re-holding them as they
  /// expired. A seeded house is 150 to 400 seats, so that is the whole screen
  /// inside two minutes. Two full bookings in flight is already more than a
  /// person needs; a script that wants more now needs a fresh account per
  /// twenty seats.
  MAX_SEATS_HELD_PER_USER: z.coerce.number().int().positive().max(100).default(20),
  /// Booking fee in minor units (paise), applied once per booking.
  BOOKING_FEE_MINOR: z.coerce.number().int().nonnegative().default(3000),
  /// How close to the screening a booking may still be cancelled. Two hours
  /// is the industry convention; past it the seat is unlikely to resell.
  CANCELLATION_WINDOW_MINUTES: z.coerce.number().int().nonnegative().default(120),
  /// How often the sweeper tidies expired holds. This is a cleanup interval,
  /// never a correctness deadline: expiry is decided on every read path.
  SWEEPER_INTERVAL_SECONDS: z.coerce.number().int().positive().default(15),
  /// Set to 0 in tests, where the sweeper is driven manually.
  SWEEPER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  // --- Payments -------------------------------------------------------------
  /// `mock` is the in-process gateway used by tests, the load test and the
  /// chaos suite. A real provider swaps in behind the same interface.
  PAYMENT_PROVIDER: z.enum(['mock']).default('mock'),
  /// Keeps its development default so the test suite, the load test and the
  /// chaos runs need no setup. Production refuses to boot on it: see `load()`.
  PAYMENT_WEBHOOK_SECRET: z.string().min(16).default(DEV_WEBHOOK_SECRET),
  /// Probability a mock payment declines, so the failure path is exercised
  /// rather than merely written.
  MOCK_PAYMENT_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  /// Artificial gateway latency in milliseconds, used by the chaos suite.
  MOCK_PAYMENT_LATENCY_MS: z.coerce.number().int().nonnegative().default(120),
  /// How long an idempotency record is replayable for.
  IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),

  // --- Mail -----------------------------------------------------------------
  /// Unset means password reset links are written to the log instead of sent.
  /// Deliberate: this project must run with no third-party account at all.
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default('Boxoffice <onboarding@resend.dev>'),
  /// Where a reset link points. The app registers `mobileapp://`, so the link
  /// opens the reset screen directly on a phone that has it installed.
  RESET_LINK_BASE: z.string().default('mobileapp://reset-password'),
  /// How long a reset link is good for. Short, because the only thing it
  /// protects is an account whose owner has already lost control of it once.
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  /// Reset requests from one address per hour. Low: each one sends mail, and
  /// an unlimited supply is both a spam cannon and an enumeration oracle.
  RATE_LIMIT_RESET_PER_HOUR: z.coerce.number().int().positive().default(5),

  // --- Rate limits ----------------------------------------------------------
  /// Per account where the request carries a session, per address otherwise;
  /// `middleware/rate-limit.ts` explains why that distinction matters more
  /// than the number does. Configurable because a load test drives thousands
  /// of virtual users from a single address and would otherwise measure the
  /// rate limiter rather than the booking mechanic.
  RATE_LIMIT_GLOBAL_PER_MINUTE: z.coerce.number().int().positive().default(120),
  /// Hold requests per account per minute. One tap on Continue is one request,
  /// not one per seat, so this sits far above what a person can produce.
  RATE_LIMIT_HOLD_PER_MINUTE: z.coerce.number().int().positive().default(30),
  /// Failed sign-ins for one account per quarter hour. This is the number that
  /// stops somebody guessing a particular person's password.
  RATE_LIMIT_AUTH_PER_15_MINUTES: z.coerce.number().int().positive().default(10),
  /// Failed sign-ins from one address per quarter hour, across every account.
  /// Deliberately much looser: its only job is to bound a spray over many
  /// accounts, and a shared network full of people mistyping their own
  /// passwords must never reach it.
  RATE_LIMIT_AUTH_IP_PER_15_MINUTES: z.coerce.number().int().positive().default(60),
  /// Accounts creatable from one address per hour.
  ///
  /// The one limit a shared network genuinely has to divide, because creating
  /// the account is the thing being rationed and there is no account yet to
  /// count it against. Twenty is set for a room of people installing the app
  /// at the same time, which is this project's normal case, and it is not
  /// free: twenty accounts at MAX_SEATS_HELD_PER_USER each is four hundred
  /// seats one address could have on hold at once. Those holds expire by
  /// themselves after HOLD_TTL_SECONDS and never become bookings without
  /// payment, so the damage is loud, temporary and self-healing rather than
  /// permanent. Lower it if this is ever deployed somewhere that matters.
  RATE_LIMIT_REGISTER_PER_HOUR: z.coerce.number().int().positive().default(20),

  /// Exposes an unauthenticated endpoint that makes the mock payment gateway
  /// misbehave, for the chaos suite. Refused outright in production.
  CHAOS_CONTROLS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

function load() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\n\nSee apps/api/.env.example`);
  }
  const e = parsed.data;
  if (e.CHAOS_CONTROLS_ENABLED && e.NODE_ENV === 'production') {
    throw new Error('CHAOS_CONTROLS_ENABLED must never be true in production');
  }
  const corsOrigins = e.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (e.NODE_ENV === 'production' && corsOrigins.length === 0) {
    // Zero parsed origins means the cors() call below falls back to
    // reflecting whatever Origin header the request sent, which combined
    // with credentials: true would let any site make authenticated requests.
    // Checked on the parsed list, not the raw string: a value like "," or "
    // " is non-empty text but parses to no real origin.
    throw new Error('CORS_ORIGINS must be set in production');
  }
  if (e.NODE_ENV === 'production' && e.PAYMENT_WEBHOOK_SECRET === DEV_WEBHOOK_SECRET) {
    // The one credential that could otherwise boot production from a value
    // published in this repository. Both JWT secrets already have no default
    // at all; this one keeps its default so tests need no setup, so the guard
    // has to live here instead.
    throw new Error('PAYMENT_WEBHOOK_SECRET must be set in production, not left at its default');
  }
  return {
    ...e,
    isProduction: e.NODE_ENV === 'production',
    isTest: e.NODE_ENV === 'test',
    corsOrigins,
  };
}

export const env = load();
export type Env = ReturnType<typeof load>;
