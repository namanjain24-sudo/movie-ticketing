import { Router } from 'express';
import { promoValidateSchema } from '@app/shared';
import { validateBody } from '../../http/validate';
import { authenticate, requireUserId } from '../../middleware/authenticate';
import * as promos from './promos.service';

export const promosRouter: Router = Router();

/** Public: offers are marketing, and showing them before sign-in is the point. */
promosRouter.get('/promos', async (_req, res) => {
  res.json({ offers: await promos.listOffers() });
});

/**
 * POST because it takes a body, but it changes nothing: it prices a code against
 * a hold. Checkout re-checks under a lock, so a "yes" here is a quote, not a
 * reservation of the code.
 */
promosRouter.post(
  '/promos/validate',
  authenticate,
  validateBody(promoValidateSchema),
  async (req, res) => {
    res.json(
      await promos.quotePromo({
        userId: requireUserId(req),
        holdId: req.body.holdId,
        code: req.body.code,
      }),
    );
  },
);
