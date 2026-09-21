import cluster from 'node:cluster';
import { availableParallelism } from 'node:os';
import { env } from './env';
import { logger } from './logger';

/**
 * Runs the API as several processes sharing one port.
 *
 * A Node process is single-threaded, so one of them tops out long before
 * Postgres does. The interesting part is that scaling out costs nothing here:
 * correctness lives in the database's row locks, not in this process's memory,
 * so eight workers contend with each other exactly the way eight machines
 * would.
 *
 * That is also why the load test is worth running against this and not against
 * a single process. A booking system that only holds together because one
 * process serialises everything has not proven anything.
 */

const WORKERS = Number(process.env.API_WORKERS ?? Math.min(availableParallelism(), 8));

if (cluster.isPrimary) {
  const totalConnections = WORKERS * env.DATABASE_POOL_MAX;
  logger.info(
    { workers: WORKERS, poolPerWorker: env.DATABASE_POOL_MAX, totalConnections },
    'Starting API cluster',
  );
  // Each worker opens its own pool, so the ceiling is workers × pool size.
  // Postgres is configured for 300 in docker-compose.yml.
  if (totalConnections > 250) {
    logger.warn(
      { totalConnections },
      'Pool total is close to the Postgres connection limit; lower DATABASE_POOL_MAX',
    );
  }

  for (let i = 0; i < WORKERS; i++) {
    cluster.fork({ WORKER_INDEX: String(i) });
  }

  cluster.on('exit', (worker, code, signal) => {
    logger.error({ pid: worker.process.pid, code, signal }, 'Worker died, restarting');
    cluster.fork({ WORKER_INDEX: String(worker.id) });
  });

  const stop = () => {
    for (const worker of Object.values(cluster.workers ?? {})) worker?.kill('SIGTERM');
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
} else {
  await import('./index');
}
