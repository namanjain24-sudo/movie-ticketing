import express, { type Express } from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './env';
import { logger } from './logger';
import { errorHandler, notFoundHandler } from './http/error-handler';
import { globalLimiter } from './middleware/rate-limit';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { healthRouter } from './modules/health/health.routes';
import { catalogRouter } from './modules/catalog/catalog.routes';
import { reviewsRouter } from './modules/reviews/reviews.routes';
import { holdsRouter } from './modules/holds/holds.routes';
import { promosRouter } from './modules/promos/promos.routes';
import { paymentsRouter } from './modules/payments/payments.routes';
import { bookingsRouter } from './modules/bookings/bookings.routes';
import { chaosRouter } from './modules/chaos/chaos.routes';
import { setWebhookDelivery } from './modules/payments/gateway';
import { handleWebhook } from './modules/payments/payments.service';

declare global {
  namespace Express {
    interface Request {
      /** Set by the JSON parser's verify hook, for webhook signature checks. */
      rawBody?: Buffer;
    }
  }
}

/**
 * The mock gateway calls back in-process rather than over a socket, so tests
 * and the load test exercise the real signature check and the real
 * deduplication without needing a listening server. Swapping in a hosted
 * provider replaces this with genuine inbound HTTP and changes nothing else.
 */
setWebhookDelivery(async (_event, rawBody, signature) => {
  await handleWebhook(rawBody, signature);
});

export function createApp(): Express {
  const app = express();

  // Behind a proxy (Render, Fly, nginx) so rate limiting sees the real client IP.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  // The seat map is the largest response in the system: 2,000 seats is roughly
  // 300 KB of JSON, and it is the first thing a phone on mobile data asks for.
  // gzip takes it to a fraction of that, which matters more here than the CPU
  // it costs.
  app.use(compression());
  app.use(
    cors({
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
      credentials: true,
    }),
  );
  app.use(
    express.json({
      limit: '1mb',
      // Webhook signatures are computed over the exact bytes the gateway sent,
      // so the parsed object is not enough: re-serialising would change key
      // order and whitespace and every signature would fail.
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(pinoHttp({ logger }));
  app.use(globalLimiter);

  app.use('/health', healthRouter);
  app.use('/v1/auth', authRouter);
  app.use('/v1/users', usersRouter);
  app.use('/v1', catalogRouter);
  app.use('/v1', reviewsRouter);
  app.use('/v1', holdsRouter);
  app.use('/v1', promosRouter);
  app.use('/v1', paymentsRouter);
  app.use('/v1/bookings', bookingsRouter);

  // Never in production: `env.ts` refuses to boot if the flag is set there.
  if (env.CHAOS_CONTROLS_ENABLED) {
    logger.warn('Chaos controls are enabled at /v1/_chaos');
    app.use('/v1/_chaos', chaosRouter);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
