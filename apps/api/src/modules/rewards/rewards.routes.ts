import { Router } from 'express';
import { pathParam } from '../../http/validate';
import { authenticate, requireUserId } from '../../middleware/authenticate';
import * as rewards from './rewards.service';

export const rewardsRouter: Router = Router();

rewardsRouter.get('/rewards', authenticate, async (req, res) => {
  res.json({ cards: await rewards.listCards(requireUserId(req)) });
});

/**
 * Reveals one card.
 *
 * POST because it is the write: it is the only moment the prize becomes known
 * to the client and the only moment the points reach the ledger. Safe to
 * repeat, though - a card already scratched answers with the same prize rather
 * than an error, so a double tap on a slow connection is not a failure.
 */
rewardsRouter.post('/rewards/:id/scratch', authenticate, async (req, res) => {
  res.json(await rewards.scratchCard(requireUserId(req), pathParam(req, 'id')));
});
