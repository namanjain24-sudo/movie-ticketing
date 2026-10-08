import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `env.ts` runs its validation at import time, so each case resets the module
 * registry and re-imports with a patched `NODE_ENV`/`CORS_ORIGINS` rather than
 * calling an exported function. That is also what makes this guard worth
 * testing directly: nothing exercises the production branch otherwise, since
 * every other test runs with `NODE_ENV=test`.
 */
describe('env CORS guard in production', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
    vi.resetModules();
  });

  async function loadWith(corsOrigins: string | undefined) {
    process.env = { ...original, NODE_ENV: 'production', CORS_ORIGINS: corsOrigins };
    vi.resetModules();
    return import('./env');
  }

  it('refuses to boot with no CORS_ORIGINS set', async () => {
    await expect(loadWith(undefined)).rejects.toThrow('CORS_ORIGINS must be set in production');
  });

  it('refuses a value that parses to zero real origins, not just an empty string', async () => {
    // A stray trailing comma or stray whitespace is non-empty text but still
    // carries no origin — exactly what the fix in env.ts checks for.
    await expect(loadWith(',')).rejects.toThrow('CORS_ORIGINS must be set in production');
    await expect(loadWith(' , ')).rejects.toThrow('CORS_ORIGINS must be set in production');
  });

  it('boots once a real origin is present', async () => {
    const { env } = await loadWith('https://app.example.com');
    expect(env.corsOrigins).toEqual(['https://app.example.com']);
  });
});
