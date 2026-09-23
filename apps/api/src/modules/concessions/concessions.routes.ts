import { Router } from 'express';
import * as concessions from './concessions.service';

export const concessionsRouter: Router = Router();

/** Public: the menu is marketing, same reasoning as the promo offers list. */
concessionsRouter.get('/concessions', async (_req, res) => {
  res.json({ items: await concessions.listConcessions() });
});
