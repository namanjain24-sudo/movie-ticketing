import { z } from 'zod';

/**
 * The process refuses to boot with a bad environment. Failing here is much
 * cheaper than failing on the first request in production.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
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
  PAYMENT_WEBHOOK_SECRET: z.string().min(16).default('mock-webhook-secret-change-me'),
  /// Probability a mock payment declines, so the failure path is exercised
  /// rather than merely written.
  MOCK_PAYMENT_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  /// Artificial gateway latency in milliseconds, used by the chaos suite.
  MOCK_PAYMENT_LATENCY_MS: z.coerce.number().int().nonnegative().default(120),
  /// How long an idempotency record is replayable for.
  IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),

  // --- Rate limits ----------------------------------------------------------
  /// Per IP, per minute. Configurable because a load test drives thousands of
  /// virtual users from a single address and would otherwise measure the rate
  /// limiter rather than the booking mechanic. Production keeps the defaults.
  RATE_LIMIT_GLOBAL_PER_MINUTE: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_HOLD_PER_MINUTE: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_AUTH_PER_15_MINUTES: z.coerce.number().int().positive().default(10),

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
  return {
    ...e,
    isProduction: e.NODE_ENV === 'production',
    isTest: e.NODE_ENV === 'test',
    corsOrigins: e.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  };
}

export const env = load();
export type Env = ReturnType<typeof load>;
