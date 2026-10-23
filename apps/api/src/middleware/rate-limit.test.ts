import express from 'express';
import rateLimit from 'express-rate-limit';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { signAccessToken, signRefreshToken } from '../lib/tokens';
import { clientKey, loginAccountKey } from './rate-limit';

/**
 * These are about *who* a request is counted against, not about the numbers.
 * The numbers live in the environment and are turned up enormously outside
 * production so the suite is not spent exhausting them; the keying is the part
 * that decides whether a room of people sharing one wifi can all use the app,
 * and it is cheap to test honestly.
 *
 * So: a throwaway app with a limit of two, driven through the real key
 * generators.
 */
function appLimitedTo(limit: number, keyGenerator: (req: express.Request) => string) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(rateLimit({ windowMs: 60_000, limit, keyGenerator, legacyHeaders: false }));
  app.post('/try', (_req, res) => void res.json({ ok: true }));
  return app;
}

/** supertest talks over loopback, so the address is spoofed via the proxy header. */
const from = (app: express.Express, ip: string) =>
  request(app).post('/try').set('X-Forwarded-For', ip);

describe('rate limit keys', () => {
  describe('clientKey', () => {
    it('gives two accounts on one address a budget each', async () => {
      const app = appLimitedTo(2, clientKey);
      const alice = signAccessToken('user-alice').token;
      const bob = signAccessToken('user-bob').token;
      const wifi = '203.0.113.7';

      await from(app, wifi).set('authorization', `Bearer ${alice}`).expect(200);
      await from(app, wifi).set('authorization', `Bearer ${alice}`).expect(200);
      await from(app, wifi).set('authorization', `Bearer ${alice}`).expect(429);

      // Bob is on the same wifi and has spent nothing. Before this change he
      // would already have been refused by Alice's browsing.
      await from(app, wifi).set('authorization', `Bearer ${bob}`).expect(200);
      await from(app, wifi).set('authorization', `Bearer ${bob}`).expect(200);
      await from(app, wifi).set('authorization', `Bearer ${bob}`).expect(429);
    });

    it('counts one account the same from any number of addresses', async () => {
      const app = appLimitedTo(2, clientKey);
      const token = signAccessToken('user-roamer').token;

      await from(app, '198.51.100.1').set('authorization', `Bearer ${token}`).expect(200);
      await from(app, '198.51.100.2').set('authorization', `Bearer ${token}`).expect(200);
      // Changing address no longer buys a fresh budget.
      await from(app, '198.51.100.3').set('authorization', `Bearer ${token}`).expect(429);
    });

    it('will not let an unverifiable token mint a bucket', async () => {
      const app = appLimitedTo(2, clientKey);
      const wifi = '203.0.113.9';

      // Three different pieces of nonsense. If any of them were trusted for
      // its `sub`, the third would succeed and the limiter would be decorative.
      await from(app, wifi).set('authorization', 'Bearer not-a-jwt-at-all').expect(200);
      await from(app, wifi).set('authorization', 'Bearer also.not.ajwt').expect(200);
      await from(app, wifi).set('authorization', 'Bearer still.not.ajwt').expect(429);
    });

    it('refuses a refresh token where an access token belongs', () => {
      const refresh = signRefreshToken('user-sneaky').token;

      // Signed with the other secret, so it does not verify here and falls
      // back to the address like any other unusable credential.
      expect(clientKey({ header: () => `Bearer ${refresh}`, ip: '203.0.113.11' } as never)).toBe(
        'ip:203.0.113.11',
      );
    });

    it('falls back to the address when there is no session at all', () => {
      expect(clientKey({ header: () => undefined, ip: '192.0.2.5' } as never)).toBe('ip:192.0.2.5');
    });

    it('names the account when the session is real', () => {
      const token = signAccessToken('user-known').token;
      expect(clientKey({ header: () => `Bearer ${token}`, ip: '192.0.2.5' } as never)).toBe(
        'user:user-known',
      );
    });
  });

  describe('loginAccountKey', () => {
    it('locks the account being guessed at, not the network it is guessed from', async () => {
      const app = appLimitedTo(2, loginAccountKey);
      const wifi = '203.0.113.20';
      const guess = (email: string) => from(app, wifi).send({ email, password: 'wrong' });

      await guess('victim@example.com').expect(200);
      await guess('victim@example.com').expect(200);
      await guess('victim@example.com').expect(429);

      // Somebody else on the same wifi signing in to their own account is
      // unaffected. This is the typo case: one person fumbling the demo
      // password used to lock the room out for fifteen minutes.
      await guess('bystander@example.com').expect(200);
    });

    it('treats an address as one account however it is capitalised or padded', async () => {
      const app = appLimitedTo(2, loginAccountKey);
      const wifi = '203.0.113.21';

      await from(app, wifi).send({ email: 'Victim@Example.com' }).expect(200);
      await from(app, wifi).send({ email: '  victim@example.com ' }).expect(200);
      await from(app, wifi).send({ email: 'VICTIM@EXAMPLE.COM' }).expect(429);
    });

    it('falls back to the address when the body names no account', () => {
      expect(loginAccountKey({ body: {}, ip: '192.0.2.8' } as never)).toBe('ip:192.0.2.8');
      expect(loginAccountKey({ body: { email: 42 }, ip: '192.0.2.8' } as never)).toBe(
        'ip:192.0.2.8',
      );
      expect(loginAccountKey({ body: undefined, ip: '192.0.2.8' } as never)).toBe('ip:192.0.2.8');
    });
  });

  describe('the liveness probe', () => {
    /**
     * A phone waiting for a sleeping free host polls this every two seconds.
     * Fifteen phones in a room doing that together is several hundred requests
     * a minute from one address, and if they spent the address budget the
     * request they were all waiting to make would be refused the moment the
     * server finally woke.
     */
    it('is not rate limited', async () => {
      const app = createApp();
      for (let i = 0; i < 300; i += 1) {
        // eslint-disable-next-line no-await-in-loop -- sequential is the point
        await request(app).get('/health/live').set('X-Forwarded-For', '203.0.113.30').expect(200);
      }
    });
  });
});
