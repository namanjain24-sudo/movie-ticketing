import { pino } from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  // Pretty output is a dev nicety. Production emits newline-delimited JSON so
  // log shippers can parse it.
  transport: env.isProduction || env.isTest ? undefined : { target: 'pino-pretty' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.refreshToken',
      'res.headers["set-cookie"]',
    ],
    remove: true,
  },
});
