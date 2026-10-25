import { Router } from 'express';
import { eventListQuerySchema, showtimeListQuerySchema } from '@app/shared';
import { pathParam, validateQuery } from '../../http/validate';
import * as catalog from '../catalog/catalog.service';
import * as events from './events.service';

export const eventsRouter: Router = Router();

/**
 * Matches, concerts, comedy, workshops and theatre.
 *
 * Reads only. A ticket to any of them is sold by the same seat map, hold and
 * checkout that sells a film ticket, so there is nothing here that writes.
 */
eventsRouter.get('/events', validateQuery(eventListQuerySchema), async (_req, res) => {
  res.json(await events.listEvents(res.locals.query));
});

eventsRouter.get('/events/:idOrSlug', async (req, res) => {
  res.json(await events.getEvent(pathParam(req, 'idOrSlug')));
});

eventsRouter.get('/events/:id/cities', async (req, res) => {
  res.json({ cities: await events.listEventCities(pathParam(req, 'id')) });
});

/**
 * An event's shows on a day, grouped by venue.
 *
 * Deliberately `listShowtimes` rather than a second implementation: the
 * grouping, the availability band and the "from" price are the same questions
 * a film asks, and answering them twice is how the two drift apart.
 */
eventsRouter.get(
  '/events/:id/shows',
  validateQuery(showtimeListQuerySchema.omit({ movieId: true })),
  async (req, res) => {
    res.json({
      venues: await catalog.listShowtimes({
        ...res.locals.query,
        eventId: pathParam(req, 'id'),
      }),
    });
  },
);
