import { Router } from 'express';
import { updateProfileSchema } from '@app/shared';
import { pathParam, validateBody } from '../../http/validate';
import { authenticate, requireUserId } from '../../middleware/authenticate';
import * as authService from '../auth/auth.service';
import * as watchlist from '../watchlist/watchlist.service';

export const usersRouter: Router = Router();

usersRouter.use(authenticate);

usersRouter.get('/me', async (req, res) => {
  res.json(await authService.getProfile(requireUserId(req)));
});

usersRouter.patch('/me', validateBody(updateProfileSchema), async (req, res) => {
  res.json(await authService.updateProfile(requireUserId(req), req.body));
});

usersRouter.get('/me/watchlist', async (req, res) => {
  res.json({ movies: await watchlist.listWatchlist(requireUserId(req)) });
});

// PUT and DELETE rather than POST: the caller is stating an end state, so
// repeating either request is harmless and the verbs say so.
usersRouter.put('/me/watchlist/:idOrSlug', async (req, res) => {
  await watchlist.saveMovie(requireUserId(req), pathParam(req, 'idOrSlug'));
  res.status(204).end();
});

usersRouter.delete('/me/watchlist/:idOrSlug', async (req, res) => {
  await watchlist.removeMovie(requireUserId(req), pathParam(req, 'idOrSlug'));
  res.status(204).end();
});
