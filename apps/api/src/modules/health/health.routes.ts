import { Router } from 'express';
import { prisma } from '../../db';

export const healthRouter: Router = Router();

/** Liveness: the process is up. Cheap enough for a load balancer to poll. */
healthRouter.get('/live', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

/** Readiness: the process can actually serve traffic, database included. */
healthRouter.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'up' });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'down' });
  }
});
