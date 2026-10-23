import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '@app/shared';
import { createApp } from '../../app';
import { prisma } from '../../db';
import { hashToken } from '../../lib/tokens';
import { resetDb } from '../../test/helpers';

const app = createApp();

const EMAIL = 'reset-me@example.com';
const OLD_PASSWORD = 'OldPassw0rd!';
const NEW_PASSWORD = 'BrandNewPass1';

/**
 * The raw token only ever leaves through the mailer, never through an HTTP
 * response, so the test reads it the way the server stores it: by hashing
 * candidates is impossible, so instead the row is matched after the fact.
 * Here the token is recovered from the mail body the transport logged.
 */
let sentMail: { to: string; subject: string; text: string }[] = [];

vi.mock('../../lib/mailer', () => ({
  sendMail: vi.fn(async (mail: { to: string; subject: string; text: string }) => {
    sentMail.push(mail);
    return { delivered: true, transport: 'log' as const };
  }),
}));

function tokenFromLastMail(): string {
  const body = sentMail.at(-1)?.text ?? '';
  const match = /token=([A-Za-z0-9_-]+)/.exec(body);
  if (!match?.[1]) throw new Error(`No reset token in mail body:\n${body}`);
  return decodeURIComponent(match[1]);
}

describe('password reset', () => {
  beforeEach(async () => {
    await resetDb();
    sentMail = [];
    await request(app)
      .post('/v1/auth/register')
      .send({ email: EMAIL, password: OLD_PASSWORD, name: 'Reset Me' })
      .expect(201);
    // Registration does not send mail; only the reset flow does.
    sentMail = [];
  });

  const forgot = (email: string) => request(app).post('/v1/auth/forgot-password').send({ email });
  const reset = (token: string, password: string) =>
    request(app).post('/v1/auth/reset-password').send({ token, password });
  const login = (password: string) =>
    request(app).post('/v1/auth/login').send({ email: EMAIL, password });

  it('resets the password and lets the new one in', async () => {
    await forgot(EMAIL).expect(202);
    await reset(tokenFromLastMail(), NEW_PASSWORD).expect(204);

    await login(NEW_PASSWORD).expect(200);
    await login(OLD_PASSWORD).expect(401);
  });

  it('answers the same for an address with no account, and sends nothing', async () => {
    const known = await forgot(EMAIL).expect(202);
    const unknown = await forgot('nobody@example.com').expect(202);

    // Identical bodies: this endpoint must not be usable to find out who has
    // an account here.
    expect(unknown.body).toEqual(known.body);
    expect(sentMail).toHaveLength(1);
    expect(sentMail[0]?.to).toBe(EMAIL);
  });

  it('refuses a token that has already been spent', async () => {
    await forgot(EMAIL).expect(202);
    const token = tokenFromLastMail();

    await reset(token, NEW_PASSWORD).expect(204);
    const second = await reset(token, 'AnotherPass123').expect(400);

    expect(second.body.error.code).toBe(ERROR_CODES.RESET_LINK_INVALID);
    // And the second attempt changed nothing.
    await login(NEW_PASSWORD).expect(200);
  });

  it('refuses a token that has expired', async () => {
    await forgot(EMAIL).expect(202);
    const token = tokenFromLastMail();

    await prisma.passwordResetToken.update({
      where: { tokenHash: hashToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await reset(token, NEW_PASSWORD).expect(400);
    expect(res.body.error.code).toBe(ERROR_CODES.RESET_LINK_INVALID);
    await login(OLD_PASSWORD).expect(200);
  });

  it('refuses a token nobody issued', async () => {
    const res = await reset('not-a-real-token-at-all-really', NEW_PASSWORD).expect(400);
    expect(res.body.error.code).toBe(ERROR_CODES.RESET_LINK_INVALID);
  });

  it('invalidates the previous link when a new one is asked for', async () => {
    await forgot(EMAIL).expect(202);
    const first = tokenFromLastMail();
    await forgot(EMAIL).expect(202);
    const second = tokenFromLastMail();

    expect(second).not.toBe(first);
    await reset(first, NEW_PASSWORD).expect(400);
    await reset(second, NEW_PASSWORD).expect(204);
  });

  it('signs every existing session out', async () => {
    // A reset is often someone who thinks another person has their account.
    // Leaving that person's thirty day refresh token alive would make the
    // reset theatre.
    const session = await login(OLD_PASSWORD).expect(200);
    const refreshToken = session.body.tokens.refreshToken as string;

    await forgot(EMAIL).expect(202);
    await reset(tokenFromLastMail(), NEW_PASSWORD).expect(204);

    await request(app).post('/v1/auth/refresh').send({ refreshToken }).expect(401);
  });

  it('holds the new password to the same rules as registration', async () => {
    await forgot(EMAIL).expect(202);
    const res = await reset(tokenFromLastMail(), 'short').expect(400);
    expect(res.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
  });

  it('never puts the token in the response', async () => {
    const res = await forgot(EMAIL).expect(202);
    const token = tokenFromLastMail();
    expect(JSON.stringify(res.body)).not.toContain(token);
  });
});
