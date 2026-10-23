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

/**
 * Sign-in. `skipSuccessfulRequests` is deliberate here: the budget is meant to
 * be spent by wrong guesses, so a household behind one NAT address signing in
 * all evening never runs it down.
 */
export const loginLimiter = rateLimit({
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
 * Registration, which needs the opposite rule.
 *
 * On sign-in a failure is the thing to ration. On registration *success* is:
 * every 201 is a fresh identity, and an unlimited supply of identities defeats
 * any per-account limit elsewhere — including the hold cap that stops one
 * account taking an auditorium hostage. Counting only failures left this
 * bounded by the global ceiling alone, which is roughly 120 new accounts a
 * minute from one address.
 *
 * Its own instance, not a shared one: express-rate-limit keys its store per
 * limiter, so reusing `loginLimiter` here would also make failed sign-ins eat
 * the signup budget and vice versa.
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: env.isProduction
    ? env.RATE_LIMIT_REGISTER_PER_HOUR
    : env.RATE_LIMIT_REGISTER_PER_HOUR * 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Too many accounts created from here. Try again later.',
    },
  },
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

/**
 * Password resets. Every one of these sends mail and names an address, so an
 * unlimited supply is both a spam cannon aimed at somebody else's inbox and a
 * cheap way to probe which addresses exist. Counted on success as well as
 * failure, for the same reason registration is.
 */
export const resetLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: env.isProduction ? env.RATE_LIMIT_RESET_PER_HOUR : env.RATE_LIMIT_RESET_PER_HOUR * 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Too many reset requests from here. Try again later.',
    },
  },
});
