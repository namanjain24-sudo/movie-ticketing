import { createApp } from './app';
import { env } from './env';
import { logger } from './logger';
import { prisma } from './db';
import { connectRedis, disconnectRedis } from './redis';
import { startSweeper, stopSweeper } from './jobs/sweeper';

const app = createApp();

// Redis is connected but never awaited into the boot decision: the API is
// fully functional without it, and refusing to start would make a non-critical
// dependency critical.
void connectRedis();

// Under `npm run api:cluster` only one worker sweeps. The job is idempotent,
// so several running it would be wasteful rather than wrong, but there is no
// reason to pay for that.
if (process.env.WORKER_INDEX === undefined || process.env.WORKER_INDEX === '0') {
  startSweeper();
}

const server = app.listen(
  {
    port: env.PORT,
    // The default backlog of 511 is the reason a load test sees "connection
    // refused" long before the application is actually the bottleneck: it is
    // the queue of connections the kernel holds between SYN and accept().
    backlog: 4_096,
  },
  () => {
    const worker = process.env.WORKER_INDEX;
    logger.info(
      `API listening on http://localhost:${env.PORT} [${env.NODE_ENV}]` +
        (worker === undefined ? '' : ` worker ${worker}`),
    );
  },
);

// Node closes an idle keep-alive socket after 5 seconds by default, which
// makes a client that reconnects constantly look like a slow server. A load
// generator holding thousands of connections open is the same shape as real
// mobile traffic here.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;

/** Finish in-flight requests and close the pool before the process dies. */
function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  stopSweeper();
  server.close(async () => {
    await Promise.allSettled([prisma.$disconnect(), disconnectRedis()]);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});
