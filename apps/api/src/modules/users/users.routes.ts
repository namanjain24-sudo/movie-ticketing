import { Router } from 'express';
import { deleteAccountSchema, updateProfileSchema } from '@app/shared';
import { pathParam, validateBody } from '../../http/validate';
import { authenticate, requireUserId } from '../../middleware/authenticate';
import * as authService from '../auth/auth.service';
import * as favoriteCinemas from '../favorites/favorite-cinemas.service';
import * as watchlist from '../watchlist/watchlist.service';

export const usersRouter: Router = Router();

usersRouter.use(authenticate);

usersRouter.get('/me', async (req, res) => {
  res.json(await authService.getProfile(requireUserId(req)));
});

usersRouter.patch('/me', validateBody(updateProfileSchema), async (req, res) => {
  res.json(await authService.updateProfile(requireUserId(req), req.body));
});

/**
 * Closes the account for good.
 *
 * POST rather than DELETE on `/me` because it carries a body: the password,
 * which is asked for since this cannot be undone. 204, because there is
 * nothing left to describe.
 */
usersRouter.post('/me/delete', validateBody(deleteAccountSchema), async (req, res) => {
  await authService.deleteAccount(requireUserId(req), req.body.password);
  res.status(204).send();
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

usersRouter.get('/me/favorite-cinemas', async (req, res) => {
  res.json({ cinemas: await favoriteCinemas.listFavoriteCinemas(requireUserId(req)) });
});

usersRouter.put('/me/favorite-cinemas/:idOrSlug', async (req, res) => {
  await favoriteCinemas.saveCinema(requireUserId(req), pathParam(req, 'idOrSlug'));
  res.status(204).end();
});

usersRouter.delete('/me/favorite-cinemas/:idOrSlug', async (req, res) => {
  await favoriteCinemas.removeCinema(requireUserId(req), pathParam(req, 'idOrSlug'));
  res.status(204).end();
});
