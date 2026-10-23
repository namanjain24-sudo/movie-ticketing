import type { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { ERROR_CODES } from '@app/shared';
import { env } from '../env';
import { verifyAccessToken } from '../lib/tokens';

const body = {
  error: { code: ERROR_CODES.RATE_LIMITED, message: 'Too many requests. Try again shortly.' },
};

/** The address, normalised the way express-rate-limit wants IPv6 grouped. */
function addressKey(req: Request): string {
  return `ip:${ipKeyGenerator(req.ip ?? '')}`;
}

/**
 * Who a request is counted against.
 *
 * The IP address is the obvious answer and it is wrong the moment several
 * people share a network, which is precisely the situation this app is built
 * to be shown in: a room of phones on one wifi is one address to the server.
 * Measured against the real client, one person doing one booking — home, film,
 * showtime, seat map, hold, checkout, the 1.5 second payment poll, the ticket
 * — is roughly thirty requests over two or three minutes. At a flat 120 per
 * minute per address, about the ninth person in the room starts being told to
 * try again shortly, and nothing they did was wrong.
 *
 * So an authenticated request is counted against the account instead. That is
 * both kinder and stricter: kinder because your neighbour's browsing is no
 * longer spending your budget, stricter because an attacker can no longer
 * escape a per-account limit by changing address.
 *
 * A token that does not verify falls through to the address deliberately. If
 * an unverifiable token minted its own bucket, an attacker would simply send a
 * different piece of nonsense each request and the limiter would be decorative.
 */
export function clientKey(req: Request): string {
  const header = req.header('authorization');
  if (header?.startsWith('Bearer ')) {
    try {
      return `user:${verifyAccessToken(header.slice('Bearer '.length).trim()).sub}`;
    } catch {
      // Not a real session. Counted as the address it came from.
    }
  }
  return addressKey(req);
}

/**
 * Broad ceiling for the whole API, per account where there is one.
 *
 * `/health/live` is exempt. It is a static object, it touches nothing, and it
 * is what a phone polls every two seconds while waiting for a sleeping free
 * host to wake. A room of phones cold-starting together would otherwise spend
 * the whole address budget on liveness probes and then be refused the request
 * they were waiting to make — a self-inflicted outage at the worst possible
 * moment, the first minute of a demo. `/health/ready` opens a database
 * connection, so it stays counted.
 */
export const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.isProduction
    ? env.RATE_LIMIT_GLOBAL_PER_MINUTE
    : env.RATE_LIMIT_GLOBAL_PER_MINUTE * 50,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: clientKey,
  skip: (req) => req.path === '/health/live',
  message: body,
});

/**
 * The account a sign-in is aimed at, or the address when the body does not
 * name one — a request with no email fails validation a moment later anyway,
 * and it must not be allowed to pick its own empty bucket.
 */
export function loginAccountKey(req: Request): string {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  if (typeof email !== 'string' || email.trim() === '') return addressKey(req);
  return `login:${email.trim().toLowerCase()}`;
}

/**
 * Sign-in, counted against the account being signed in to.
 *
 * `skipSuccessfulRequests` is deliberate here: the budget is meant to be spent
 * by wrong guesses, so somebody signing in all evening never runs it down.
 *
 * Keying this by address was the wrong trade. Guessing one person's password
 * is what the limit exists to stop, and that attack does not care which
 * address it comes from; meanwhile a handful of typos on a shared network —
 * and the demo password has a zero in it that people reliably type as an o —
 * would lock sign-in for everyone else on that wifi for a quarter of an hour.
 * The address keeps its own looser ceiling below, which is what catches a
 * spray across many accounts.
 */
export const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.isProduction
    ? env.RATE_LIMIT_AUTH_PER_15_MINUTES
    : env.RATE_LIMIT_AUTH_PER_15_MINUTES * 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: loginAccountKey,
  message: {
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Too many sign-in attempts for this account. Try again in a few minutes.',
    },
  },
});

/**
 * Sign-in again, this time per address, and loose.
 *
 * Its job is only to bound a spray: many accounts tried once each from one
 * place, which the per-account limiter above cannot see because no single
 * account is attacked twice. Loose enough that a shared network full of
 * people mistyping their own passwords never reaches it.
 */
export const loginAddressLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.isProduction
    ? env.RATE_LIMIT_AUTH_IP_PER_15_MINUTES
    : env.RATE_LIMIT_AUTH_IP_PER_15_MINUTES * 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: addressKey,
  message: body,
});

/**
 * Registration, which needs the opposite rule to sign-in.
 *
 * On sign-in a failure is the thing to ration. On registration *success* is:
 * every 201 is a fresh identity, and an unlimited supply of identities defeats
 * any per-account limit elsewhere — including the hold cap that stops one
 * account taking an auditorium hostage. Counting only failures left this
 * bounded by the global ceiling alone, which is roughly 120 new accounts a
 * minute from one address.
 *
 * It cannot be keyed by account, because creating the account is the point, so
 * a shared network genuinely does share this one. The ceiling is set for a
 * room of people making accounts at once rather than for a single household;
 * see the note on the environment variable for what that costs.
 *
 * Its own instance, not a shared one: express-rate-limit keys its store per
 * limiter, so reusing a sign-in limiter here would also make failed sign-ins
 * eat the signup budget and vice versa.
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: env.isProduction
    ? env.RATE_LIMIT_REGISTER_PER_HOUR
    : env.RATE_LIMIT_REGISTER_PER_HOUR * 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: addressKey,
  message: {
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Too many accounts created from here. Try again later.',
    },
  },
});

/**
 * Holds are the contended endpoint, counted against the account.
 *
 * What actually stops an auditorium being taken hostage is
 * `MAX_SEATS_HELD_PER_USER`, which is enforced per account inside the
 * transaction and is unaffected by any of this. This limit is the cheaper
 * outer guard, and per account is where it belongs: generous for a real person
 * retrying a tap, and no longer something fifteen people in one room have to
 * divide between them.
 */
export const holdLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.isProduction ? env.RATE_LIMIT_HOLD_PER_MINUTE : env.RATE_LIMIT_HOLD_PER_MINUTE * 5_000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: clientKey,
  message: body,
});

/**
 * Password resets. Every one of these sends mail and names an address, so an
 * unlimited supply is both a spam cannon aimed at somebody else's inbox and a
 * cheap way to probe which addresses exist. Counted on success as well as
 * failure, for the same reason registration is, and per address because the
 * caller is by definition not signed in.
 */
export const resetLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: env.isProduction ? env.RATE_LIMIT_RESET_PER_HOUR : env.RATE_LIMIT_RESET_PER_HOUR * 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: addressKey,
  message: {
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Too many reset requests from here. Try again later.',
    },
  },
});
