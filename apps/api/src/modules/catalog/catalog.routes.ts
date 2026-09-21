import { Router } from 'express';
import { cinemaListQuerySchema, movieListQuerySchema, showtimeListQuerySchema } from '@app/shared';
import { optionalAuthenticate } from '../../middleware/authenticate';
import { pathParam, validateQuery } from '../../http/validate';
import * as catalog from './catalog.service';

export const catalogRouter: Router = Router();

catalogRouter.get('/cities', async (_req, res) => {
  res.json({ cities: await catalog.listCities() });
});

catalogRouter.get('/cinema-brands', async (_req, res) => {
  res.json({ brands: await catalog.listBrands() });
});

/**
 * The venue directory. `lat`/`lng` are optional; supplying them adds a
 * distance to every entry and sorts by it, which is the only ordering
 * "cinemas near me" can honestly mean.
 */
catalogRouter.get('/cinemas', validateQuery(cinemaListQuerySchema), async (_req, res) => {
  res.json({ cinemas: await catalog.listCinemas(res.locals.query) });
});

catalogRouter.get('/cinemas/:idOrSlug', async (req, res) => {
  res.json(await catalog.getCinema(pathParam(req, 'idOrSlug')));
});

catalogRouter.get('/movies', validateQuery(movieListQuerySchema), async (_req, res) => {
  res.json({ movies: await catalog.listMovies(res.locals.query) });
});

catalogRouter.get('/movies/:idOrSlug', async (req, res) => {
  res.json(await catalog.getMovie(pathParam(req, 'idOrSlug')));
});

catalogRouter.get('/showtimes', validateQuery(showtimeListQuerySchema), async (_req, res) => {
  res.json({ cinemas: await catalog.listShowtimes(res.locals.query) });
});

/**
 * Public, but authenticated callers get their own held seats marked as theirs,
 * so returning to the map mid-checkout does not look like someone else took
 * the seats.
 */
catalogRouter.get('/showtimes/:id/seatmap', optionalAuthenticate, async (req, res) => {
  res.json(await catalog.getSeatMap({ showtimeId: pathParam(req, 'id'), userId: req.userId }));
});
