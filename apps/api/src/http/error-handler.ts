import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { ERROR_CODES } from '@app/shared';
import { HttpError } from './errors';
import { LOCK_TIMEOUT_SQLSTATE, TRANSIENT_SQLSTATES, sqlState } from '../lib/sql-state';
import { logger } from '../logger';
import { env } from '../env';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(HttpError.notFound(`No route for ${req.method} ${req.path}`));
};

/**
 * Single exit point for every failure, so clients always get the same body
 * shape (`ApiError` in @app/shared) no matter what went wrong.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Some fields need attention',
        details: fieldErrors(err),
      },
    });
    return;
  }

  // A transaction that ran out of time wrote nothing, so the honest answer is
  // "try again", not "something went wrong". Without this the client sees a
  // 500 for what is really contention, and a load report counts it as a fault.
  if (isTransactionTimeout(err)) {
    logger.warn({ err }, 'Transaction timed out under contention');
    res.status(409).json({
      error: {
        code: ERROR_CODES.SEATS_CONTENDED,
        message: 'The system is busy right now. Try again.',
      },
    });
    return;
  }

  // The database went away underneath the request: a failover, a restart, a
  // terminated backend. Nothing was written, and the client should retry
  // rather than be told the booking system is broken.
  if (isTransientDatabaseError(err)) {
    logger.warn({ err }, 'Transient database error');
    res.setHeader('Retry-After', '2');
    res.status(503).json({
      error: {
        code: ERROR_CODES.INTERNAL,
        message: 'The service is briefly unavailable. Try again.',
      },
    });
    return;
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    error: {
      code: ERROR_CODES.INTERNAL,
      message: env.isProduction ? 'Something went wrong' : String(err?.message ?? err),
    },
  });
};

/**
 * A transaction that ran out of time: Prisma's own P2028, or Postgres
 * cancelling a statement that waited too long for a row lock.
 */
function isTransactionTimeout(err: unknown): boolean {
  if ((err as { code?: unknown })?.code === 'P2028') return true;
  return sqlState(err) === LOCK_TIMEOUT_SQLSTATE;
}

function isTransientDatabaseError(err: unknown): boolean {
  const state = sqlState(err);
  return state !== undefined && TRANSIENT_SQLSTATES.has(state);
}

export function fieldErrors(err: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
