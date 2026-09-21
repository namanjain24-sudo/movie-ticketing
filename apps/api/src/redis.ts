import { Redis } from 'ioredis';
import { env } from './env';
import { logger } from './logger';

/**
 * Redis is deliberately not on the correctness path. It carries realtime
 * fanout and nothing else; seat state lives in Postgres. Every call site here
 * must therefore tolerate Redis being unreachable, which is exactly what the
 * chaos suite kills it to prove.
 */
function createClient(role: string) {
  const client = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    // Reconnect forever with a bounded backoff. A restarted Redis should be
    // picked up again without restarting the API.
    retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
    enableOfflineQueue: false,
  });

  client.on('error', (err: Error) => {
    // Logged at warn, not error: an unreachable Redis degrades realtime
    // updates and nothing more.
    logger.warn({ err: err.message, role }, 'Redis error');
  });
  client.on('ready', () => logger.info({ role }, 'Redis connected'));

  return client;
}

const globalForRedis = globalThis as unknown as {
  redisPub?: Redis;
  redisSub?: Redis;
};

/** Publisher. Also used for anything that is a plain command. */
export const redisPub = globalForRedis.redisPub ?? createClient('publisher');
/** Subscriber. A connection in subscribe mode cannot issue other commands. */
export const redisSub = globalForRedis.redisSub ?? createClient('subscriber');

if (!env.isProduction) {
  globalForRedis.redisPub = redisPub;
  globalForRedis.redisSub = redisSub;
}

export async function connectRedis(): Promise<void> {
  await Promise.allSettled([redisPub.connect(), redisSub.connect()]);
}

export async function disconnectRedis(): Promise<void> {
  await Promise.allSettled([redisPub.quit(), redisSub.quit()]);
}

/**
 * Publish without letting a Redis failure reach the caller. Used by write
 * paths that have already committed to Postgres, where the durable work is
 * done and the broadcast is a courtesy.
 */
export async function publishBestEffort(channel: string, payload: unknown): Promise<void> {
  try {
    await redisPub.publish(channel, JSON.stringify(payload));
  } catch (err) {
    logger.warn({ err, channel }, 'Realtime publish dropped');
  }
}
