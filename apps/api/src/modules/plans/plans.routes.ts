import { createPlanSchema, planVoteSchema } from '@app/shared';
import { Router } from 'express';
import { pathParam, validateBody } from '../../http/validate';
import { authenticate, optionalAuthenticate, requireUserId } from '../../middleware/authenticate';
import * as plans from './plans.service';

export const plansRouter: Router = Router();

plansRouter.post('/plans', authenticate, validateBody(createPlanSchema), async (req, res) => {
  res.status(201).json(await plans.createPlan(requireUserId(req), req.body));
});

/** The plans this account is in that have not happened yet. */
plansRouter.get('/plans', authenticate, async (req, res) => {
  res.json({ plans: await plans.listPlans(requireUserId(req)) });
});

/**
 * Readable without signing in, on purpose.
 *
 * The code arrives in a group chat, and the first thing it should do is show
 * what is being proposed. Demanding an account before anybody can see what
 * their friend sent is how a shared link becomes a dead end. Joining and
 * voting still need one.
 */
plansRouter.get('/plans/:code', optionalAuthenticate, async (req, res) => {
  res.json(await plans.getPlan(pathParam(req, 'code'), req.userId));
});

plansRouter.post('/plans/:code/join', authenticate, async (req, res) => {
  res.json(await plans.joinPlan(pathParam(req, 'code'), requireUserId(req)));
});

/**
 * Toggles one mark. POST rather than PUT: the body names the showing, not the
 * new state, and sending the state would invite two phones overwriting each
 * other's idea of it.
 */
plansRouter.post(
  '/plans/:code/votes',
  authenticate,
  validateBody(planVoteSchema),
  async (req, res) => {
    res.json(await plans.toggleVote(pathParam(req, 'code'), requireUserId(req), req.body.optionId));
  },
);
