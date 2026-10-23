import { Router } from 'express';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from '@app/shared';
import { validateBody } from '../../http/validate';
import { loginLimiter, registerLimiter, resetLimiter } from '../../middleware/rate-limit';
import * as authService from './auth.service';

export const authRouter: Router = Router();

authRouter.post('/register', registerLimiter, validateBody(registerSchema), async (req, res) => {
  res.status(201).json(await authService.register(req.body));
});

authRouter.post('/login', loginLimiter, validateBody(loginSchema), async (req, res) => {
  res.json(await authService.login(req.body));
});

authRouter.post('/refresh', validateBody(refreshSchema), async (req, res) => {
  res.json(await authService.refresh(req.body.refreshToken));
});

authRouter.post('/logout', validateBody(refreshSchema), async (req, res) => {
  await authService.logout(req.body.refreshToken);
  res.status(204).send();
});

/**
 * 202, always, and with the same body whether or not that address has an
 * account. Answering honestly here would turn this into an account
 * enumerator: point a script at a list of addresses and it sorts them into
 * customers and non-customers for nothing.
 */
authRouter.post(
  '/forgot-password',
  resetLimiter,
  validateBody(forgotPasswordSchema),
  async (req, res) => {
    await authService.requestPasswordReset(req.body.email);
    res.status(202).json({
      message: 'If that address has an account, a reset link is on its way.',
    });
  },
);

authRouter.post(
  '/reset-password',
  resetLimiter,
  validateBody(resetPasswordSchema),
  async (req, res) => {
    await authService.resetPassword(req.body);
    res.status(204).send();
  },
);
