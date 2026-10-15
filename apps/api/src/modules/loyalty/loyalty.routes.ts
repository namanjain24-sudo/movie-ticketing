import { Router } from 'express';
import { loyaltyRedeemSchema } from '@app/shared';
import { validateBody } from '../../http/validate';
import { authenticate, requireUserId } from '../../middleware/authenticate';
import * as loyalty from './loyalty.service';

export const loyaltyRouter: Router = Router();

loyaltyRouter.get('/loyalty/balance', authenticate, async (req, res) => {
  res.json(await loyalty.getBalance(requireUserId(req)));
});

/**
 * POST because it takes a body, but it changes nothing: it prices a spend
 * against a hold. Checkout re-checks under a lock, so a "yes" here is a
 * quote, not a reservation of the points.
 */
loyaltyRouter.post(
  '/loyalty/quote',
  authenticate,
  validateBody(loyaltyRedeemSchema),
  async (req, res) => {
    res.json(
      await loyalty.quoteRedemption({
        userId: requireUserId(req),
        holdId: req.body.holdId,
        points: req.body.points,
      }),
    );
  },
);
