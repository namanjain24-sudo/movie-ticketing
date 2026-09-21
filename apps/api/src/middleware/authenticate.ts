import type { RequestHandler } from 'express';
import { HttpError } from '../http/errors';
import { verifyAccessToken } from '../lib/tokens';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/** Rejects the request unless it carries a valid, unexpired access token. */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    next(HttpError.unauthorized('Missing bearer token'));
    return;
  }
  try {
    const claims = verifyAccessToken(header.slice('Bearer '.length).trim());
    req.userId = claims.sub;
    next();
  } catch {
    next(HttpError.unauthorized('Your session has expired'));
  }
};

/**
 * Attaches the user when a valid token is present and does nothing otherwise.
 * Used by the seat map, which is public but shows a signed-in user their own
 * held seats as "yours" rather than as merely unavailable.
 */
export const optionalAuthenticate: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }
  try {
    req.userId = verifyAccessToken(header.slice('Bearer '.length).trim()).sub;
  } catch {
    // An expired token on a public route is not an error; the caller simply
    // sees the anonymous view.
  }
  next();
};

/** Use inside a handler that sits behind `authenticate`. */
export function requireUserId(req: { userId?: string }): string {
  if (!req.userId) throw HttpError.unauthorized();
  return req.userId;
}
