import type { User } from '@prisma/client';
import type { AuthResponse, LoginInput, RegisterInput } from '@app/shared';
import { prisma } from '../../db';
import { HttpError } from '../../http/errors';
import { hashPassword, verifyPassword } from '../../lib/password';
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/tokens';

/** A bcrypt hash of a value nobody knows, used only to burn time. */
const DUMMY_HASH = '$2b$12$Wlt8iq0FO.vYzOlzHZGGvuqRsi/6QWH/DxOZQ.FzygQwim.jQE6u6';

function toPublicUser(user: User): AuthResponse['user'] {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
  };
}

async function issueTokens(userId: string): Promise<AuthResponse['tokens']> {
  const access = signAccessToken(userId);
  const refresh = signRefreshToken(userId);
  await prisma.refreshToken.create({
    data: {
      id: refresh.jti,
      tokenHash: hashToken(refresh.token),
      userId,
      expiresAt: refresh.expiresAt,
    },
  });
  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    expiresIn: access.expiresIn,
  };
}

export async function register(input: RegisterInput): Promise<AuthResponse> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw HttpError.conflict('An account with this email already exists');

  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
    },
  });
  return { user: toPublicUser(user), tokens: await issueTokens(user.id) };
}

export async function login(input: LoginInput): Promise<AuthResponse> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Hash even when the user is missing, so response time does not reveal
  // whether an email is registered.
  const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw HttpError.unauthorized('Email or password is incorrect');

  return { user: toPublicUser(user), tokens: await issueTokens(user.id) };
}

/**
 * Rotating refresh: the presented token is revoked and a fresh pair issued.
 * Presenting an already-revoked token revokes the user's whole family of
 * tokens, since that is the signature of a stolen token being replayed.
 */
export async function refresh(token: string): Promise<AuthResponse> {
  let claims;
  try {
    claims = verifyRefreshToken(token);
  } catch {
    throw HttpError.unauthorized('Your session has expired');
  }

  const stored = await prisma.refreshToken.findUnique({ where: { id: claims.jti } });
  if (!stored || stored.tokenHash !== hashToken(token)) {
    throw HttpError.unauthorized('Your session has expired');
  }

  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw HttpError.unauthorized('Your session was ended for security reasons');
  }

  if (stored.expiresAt.getTime() < Date.now()) {
    throw HttpError.unauthorized('Your session has expired');
  }

  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user) throw HttpError.unauthorized('Your session has expired');

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  return { user: toPublicUser(user), tokens: await issueTokens(user.id) };
}

export async function logout(token: string): Promise<void> {
  try {
    const claims = verifyRefreshToken(token);
    await prisma.refreshToken.updateMany({
      where: { id: claims.jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch {
    // Signing out with an unusable token is not an error worth surfacing.
  }
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw HttpError.notFound('Account not found');
  return toPublicUser(user);
}

export async function updateProfile(
  userId: string,
  data: { name?: string; avatarUrl?: string | null },
) {
  const user = await prisma.user.update({ where: { id: userId }, data });
  return toPublicUser(user);
}
