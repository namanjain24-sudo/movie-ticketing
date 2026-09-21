import { createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { accessTokenClaimsSchema, refreshTokenClaimsSchema } from '@app/shared';
import { env } from '../env';

export function signAccessToken(userId: string): { token: string; expiresIn: number } {
  const token = jwt.sign({ sub: userId, type: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
  });
  const decoded = jwt.decode(token) as { exp?: number; iat?: number } | null;
  const expiresIn = decoded?.exp && decoded?.iat ? decoded.exp - decoded.iat : 900;
  return { token, expiresIn };
}

export function signRefreshToken(userId: string): { token: string; jti: string; expiresAt: Date } {
  const jti = randomUUID();
  const token = jwt.sign({ sub: userId, type: 'refresh', jti }, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
  });
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  return { token, jti, expiresAt };
}

export function verifyAccessToken(token: string) {
  return accessTokenClaimsSchema.parse(jwt.verify(token, env.JWT_ACCESS_SECRET));
}

export function verifyRefreshToken(token: string) {
  return refreshTokenClaimsSchema.parse(jwt.verify(token, env.JWT_REFRESH_SECRET));
}

/** Refresh tokens are stored hashed, so a database dump cannot be replayed. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
