import { Router } from 'express';
import { supportAskSchema } from '@app/shared';
import { authenticate, requireUserId } from '../../middleware/authenticate';
import { supportLimiter } from '../../middleware/rate-limit';
import { validateBody } from '../../http/validate';
import * as support from './support.service';

export const supportRouter: Router = Router();

/**
 * Ask the support agent something.
 *
 * Authenticated, because the whole point is that the answer is grounded in
 * *this* account's bookings — and because an unauthenticated endpoint that
 * makes a paid API call per request is a bill waiting to happen.
 *
 * Rate limited per account rather than per address: the cost is per account's
 * questions, and a household on one wifi should not share a budget.
 */
supportRouter.post(
  '/support/ask',
  authenticate,
  supportLimiter,
  validateBody(supportAskSchema),
  async (req, res) => {
    res.json(
      await support.reply({
        userId: requireUserId(req),
        message: req.body.message,
        history: req.body.history,
      }),
    );
  },
);
