import { Router } from 'express';
import { createHoldSchema } from '@app/shared';
import { authenticate, requireUserId } from '../../middleware/authenticate';
import { holdLimiter } from '../../middleware/rate-limit';
import { pathParam, validateBody } from '../../http/validate';
import { requireIdempotencyKey, withIdempotency } from '../../lib/idempotency';
import * as holds from './holds.service';

export const holdsRouter: Router = Router();

/**
 * Taking a hold is the one request in the system that must never run twice for
 * one user action, so the `Idempotency-Key` header is mandatory rather than
 * advisory. A retried tap on a flaky network returns the original hold instead
 * of claiming a second set of seats.
 */
holdsRouter.post(
  '/showtimes/:id/holds',
  authenticate,
  holdLimiter,
  validateBody(createHoldSchema),
  async (req, res) => {
    const userId = requireUserId(req);
    const key = requireIdempotencyKey(req);
    const showtimeId = pathParam(req, 'id');

    const result = await withIdempotency({
      key,
      scope: `POST /v1/showtimes/${showtimeId}/holds`,
      userId,
      request: req.body,
      run: async () => ({
        status: 201,
        body: await holds.createHold({ userId, showtimeId, showSeatIds: req.body.showSeatIds }),
      }),
    });

    res.setHeader('Idempotent-Replay', String(result.replayed));
    res.status(result.status).json(result.body);
  },
);

/**
 * What this account still has on hold.
 *
 * Declared before `/holds/:id` on purpose: Express matches in order, and
 * registered after it this path would be read as a hold whose id is the word
 * "active" and answered with a 404.
 */
holdsRouter.get('/holds/active', authenticate, async (req, res) => {
  res.json({ holds: await holds.listActiveHolds({ userId: requireUserId(req) }) });
});

/** Polled by the checkout countdown, which never trusts the device clock. */
holdsRouter.get('/holds/:id', authenticate, async (req, res) => {
  res.json(await holds.getHold({ userId: requireUserId(req), holdId: pathParam(req, 'id') }));
});

holdsRouter.delete('/holds/:id', authenticate, async (req, res) => {
  await holds.releaseHold({ userId: requireUserId(req), holdId: pathParam(req, 'id') });
  res.status(204).send();
});
