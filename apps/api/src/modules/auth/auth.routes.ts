import { Router } from 'express';
import { loginSchema, refreshSchema, registerSchema } from '@app/shared';
import { validateBody } from '../../http/validate';
import { authLimiter } from '../../middleware/rate-limit';
import * as authService from './auth.service';

export const authRouter: Router = Router();

authRouter.post('/register', authLimiter, validateBody(registerSchema), async (req, res) => {
  res.status(201).json(await authService.register(req.body));
});

authRouter.post('/login', authLimiter, validateBody(loginSchema), async (req, res) => {
  res.json(await authService.login(req.body));
});

authRouter.post('/refresh', validateBody(refreshSchema), async (req, res) => {
  res.json(await authService.refresh(req.body.refreshToken));
});

authRouter.post('/logout', validateBody(refreshSchema), async (req, res) => {
  await authService.logout(req.body.refreshToken);
  res.status(204).send();
});
