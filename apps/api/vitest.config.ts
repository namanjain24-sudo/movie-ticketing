import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // The suite shares one database and truncates between files, so files must
    // not run concurrently. Tests *within* a file still run real concurrent
    // requests against the API, which is the point.
    fileParallelism: false,
    // The concurrency test fires thousands of requests; the default 5s is not
    // enough on a cold pool.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      // timezone pinned on the connection: Prisma's DateTime is `timestamp`
      // without time zone, and a non-UTC session shifts every value it round trips.
      DATABASE_URL:
        'postgresql://ticketing:ticketing@localhost:5432/ticketing_test?options=-c%20timezone%3DUTC',
      DATABASE_POOL_MAX: '40',
      REDIS_URL: 'redis://localhost:6379',
      SWEEPER_ENABLED: 'false',
      MOCK_PAYMENT_FAILURE_RATE: '0',
      MOCK_PAYMENT_LATENCY_MS: '0',
      PAYMENT_WEBHOOK_SECRET: 'test-webhook-secret-long-enough',
      JWT_ACCESS_SECRET: 'test-access-secret-long-enough-for-validation-ok',
      JWT_REFRESH_SECRET: 'test-refresh-secret-long-enough-for-validation',
      ACCESS_TOKEN_TTL: '15m',
      REFRESH_TOKEN_TTL_DAYS: '30',
      LOG_LEVEL: 'fatal',
    },
  },
});
