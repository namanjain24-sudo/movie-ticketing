import { Router } from 'express';
import { reviewListQuerySchema, upsertReviewSchema } from '@app/shared';
import { authenticate, optionalAuthenticate, requireUserId } from '../../middleware/authenticate';
import { pathParam, validateBody, validateQuery } from '../../http/validate';
import * as reviews from './reviews.service';

export const reviewsRouter: Router = Router();

/**
 * Public. Authenticated callers additionally get their own review flagged and
 * hoisted, so the screen can offer "edit yours" without a second request.
 */
reviewsRouter.get(
  '/movies/:idOrSlug/reviews',
  optionalAuthenticate,
  validateQuery(reviewListQuerySchema),
  async (req, res) => {
    const query = res.locals.query as {
      sort: 'recent' | 'helpful' | 'highest' | 'lowest';
      rating?: number;
    };
    res.json(
      await reviews.listReviews({
        idOrSlug: pathParam(req, 'idOrSlug'),
        sort: query.sort,
        rating: query.rating,
        userId: req.userId,
      }),
    );
  },
);

/**
 * PUT rather than POST: one person has one review per film, so the request is
 * idempotent by nature and the verb should say so. A second call edits.
 */
reviewsRouter.put(
  '/movies/:idOrSlug/reviews/me',
  authenticate,
  validateBody(upsertReviewSchema),
  async (req, res) => {
    const body = req.body as { rating: number; body?: string | null };
    res.json(
      await reviews.upsertReview({
        idOrSlug: pathParam(req, 'idOrSlug'),
        userId: requireUserId(req),
        rating: body.rating,
        body: body.body,
      }),
    );
  },
);

reviewsRouter.delete('/movies/:idOrSlug/reviews/me', authenticate, async (req, res) => {
  await reviews.deleteReview({
    idOrSlug: pathParam(req, 'idOrSlug'),
    userId: requireUserId(req),
  });
  res.status(204).end();
});
