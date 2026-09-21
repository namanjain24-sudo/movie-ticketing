import rateLimit from 'express-rate-limit';
import { ERROR_CODES } from '@app/shared';
import { env } from '../env';

const body = {
  error: { code: ERROR_CODES.RATE_LIMITED, message: 'Too many requests. Try again shortly.' },
};

/** Broad ceiling for the whole API. */
export const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.isProduction
    ? env.RATE_LIMIT_GLOBAL_PER_MINUTE
    : env.RATE_LIMIT_GLOBAL_PER_MINUTE * 50,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: body,
});

/** Much tighter, because these are the endpoints that get brute-forced. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.isProduction
    ? env.RATE_LIMIT_AUTH_PER_15_MINUTES
    : env.RATE_LIMIT_AUTH_PER_15_MINUTES * 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: body,
});

/**
 * Holds are the contended endpoint. The limit is per IP and generous enough
 * for a real user retrying a tap, but low enough that one client cannot sit on
 * an auditorium's inventory by holding and releasing in a loop.
 */
export const holdLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.isProduction ? env.RATE_LIMIT_HOLD_PER_MINUTE : env.RATE_LIMIT_HOLD_PER_MINUTE * 5_000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: body,
});
