import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { afterAll, beforeAll } from 'vitest';

const apiRoot = resolve(import.meta.dirname, '../..');
const url = process.env.DATABASE_URL;

/**
 * The suite runs against a real Postgres, not a mock and not SQLite. Every
 * claim this project makes is about behaviour under concurrent transactions,
 * and a fake database cannot exhibit it.
 *
 * `docker compose up -d` at the repo root starts the test instance on 5434.
 * It is tmpfs-backed with fsync off, so a full migrate takes about a second.
 */
beforeAll(() => {
  execSync('npx prisma migrate deploy', {
    cwd: apiRoot,
    stdio: 'ignore',
    // prisma.config.ts prefers an explicit DATABASE_URL over the one in .env,
    // so this is what decides which database the suite migrates.
    env: { ...process.env, DATABASE_URL: url },
  });
});

afterAll(async () => {
  const { prisma } = await import('../db');
  const { disconnectRedis } = await import('../redis');
  await Promise.allSettled([prisma.$disconnect(), disconnectRedis()]);
});
