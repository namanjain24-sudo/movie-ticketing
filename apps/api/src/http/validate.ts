import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { HttpError } from './errors';
import { fieldErrors } from './error-handler';

/**
 * Parses and replaces the request body with the typed result, so handlers
 * downstream read validated, coerced data rather than raw input.
 */
export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(HttpError.badRequest('Some fields need attention', fieldErrors(result.error)));
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: ZodType<T>): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(HttpError.badRequest('Invalid query parameters', fieldErrors(result.error)));
      return;
    }
    // Express 5 exposes req.query as a getter, so stash the parsed value here.
    res.locals.query = result.data;
    next();
  };
}

/**
 * Express 5 types path params as possibly absent or repeated. A route that
 * declares `:id` always has one, but reading it through this keeps the types
 * honest and turns a genuinely malformed path into a 400 rather than a crash.
 */
export function pathParam(req: { params: Record<string, unknown> }, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw HttpError.badRequest(`Missing ${name} in the path`);
  }
  return value;
}
