import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { prisma } from '../../db';

const app = createApp();

const validUser = {
  email: 'Naman@Example.com',
  password: 'CorrectHorse9',
  name: 'Naman',
};

function registerUser(overrides: Partial<typeof validUser> = {}) {
  return request(app)
    .post('/v1/auth/register')
    .send({ ...validUser, ...overrides });
}

beforeEach(async () => {
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

describe('POST /v1/auth/register', () => {
  it('creates an account and returns a token pair', async () => {
    const res = await registerUser();

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('naman@example.com');
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.tokens.accessToken).toBeTypeOf('string');
    expect(res.body.tokens.expiresIn).toBeGreaterThan(0);
  });

  it('rejects a weak password with field-level detail', async () => {
    const res = await registerUser({ password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.password.length).toBeGreaterThan(0);
  });

  it('refuses a duplicate email regardless of casing', async () => {
    await registerUser();
    const res = await registerUser({ email: 'NAMAN@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

describe('POST /v1/auth/login', () => {
  it('signs in with correct credentials', async () => {
    await registerUser();
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: validUser.email, password: validUser.password });

    expect(res.status).toBe(200);
    expect(res.body.tokens.refreshToken).toBeTypeOf('string');
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    await registerUser();
    const wrongPassword = await request(app)
      .post('/v1/auth/login')
      .send({ email: validUser.email, password: 'WrongPassword9' });
    const unknownEmail = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'nobody@example.com', password: validUser.password });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });
});

describe('POST /v1/auth/refresh', () => {
  it('rotates the refresh token', async () => {
    const { body } = await registerUser();
    const res = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: body.tokens.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.tokens.refreshToken).not.toBe(body.tokens.refreshToken);
  });

  it('kills every session when a revoked token is replayed', async () => {
    const { body } = await registerUser();
    const first = body.tokens.refreshToken;
    const rotated = await request(app).post('/v1/auth/refresh').send({ refreshToken: first });

    const replay = await request(app).post('/v1/auth/refresh').send({ refreshToken: first });
    expect(replay.status).toBe(401);

    // The token issued by the legitimate rotation is revoked too.
    const afterBreach = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: rotated.body.tokens.refreshToken });
    expect(afterBreach.status).toBe(401);
  });
});

describe('POST /v1/auth/logout', () => {
  it('makes the refresh token unusable', async () => {
    const { body } = await registerUser();
    await request(app).post('/v1/auth/logout').send({ refreshToken: body.tokens.refreshToken });

    const res = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: body.tokens.refreshToken });
    expect(res.status).toBe(401);
  });
});

describe('/v1/users/me', () => {
  it('returns the signed-in user', async () => {
    const { body } = await registerUser();
    const res = await request(app)
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${body.tokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('naman@example.com');
  });

  it('updates the profile name', async () => {
    const { body } = await registerUser();
    const res = await request(app)
      .patch('/v1/users/me')
      .set('Authorization', `Bearer ${body.tokens.accessToken}`)
      .send({ name: 'Naman Jain' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Naman Jain');
  });

  it('refuses a request with no token', async () => {
    const res = await request(app).get('/v1/users/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});
