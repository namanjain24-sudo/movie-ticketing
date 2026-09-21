import { defineConfig } from 'prisma/config';

/**
 * An explicit DATABASE_URL in the environment always wins. Captured before the
 * .env file is loaded, because `loadEnvFile` overwrites, and the test runner
 * points at a different database by setting this variable.
 */
const explicitUrl = process.env.DATABASE_URL;

// Prisma's CLI does not read .env for us any more, so load it when present.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env (CI, tests): fall back to whatever is already in the environment.
}

/**
 * Prisma 7 reads the migration connection URL from here rather than from the
 * schema. The runtime client gets its own connection in src/db.ts.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url:
      explicitUrl ??
      process.env.DATABASE_URL ??
      'postgresql://ticketing:ticketing@localhost:5432/ticketing',
  },
});
