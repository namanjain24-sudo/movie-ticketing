import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from './env';

/**
 * Postgres through a driver adapter, with the pool sized explicitly. The
 * default of 10 is far too small for the load test: every hold holds a
 * connection for the duration of a `FOR UPDATE` transaction, so an undersized
 * pool shows up as queueing latency that looks like a database problem but is
 * not one.
 */
function createClient() {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    // A hold transaction that cannot get a connection should fail fast and let
    // the client retry, rather than sitting in the queue past the user's
    // patience.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  return new PrismaClient({
    adapter,
    log: env.isTest ? ['error'] : ['warn', 'error'],
  });
}

/**
 * Cached on `globalThis` so `tsx watch` reloads do not open a fresh pool on
 * every file save.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (!env.isProduction) globalForPrisma.prisma = prisma;

export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
