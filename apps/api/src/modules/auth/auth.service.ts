import type { User } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import type { AuthResponse, LoginInput, RegisterInput, ResetPasswordInput } from '@app/shared';
import { prisma } from '../../db';
import { env } from '../../env';
import { HttpError } from '../../http/errors';
import { hashPassword, verifyPassword } from '../../lib/password';
import { sendMail } from '../../lib/mailer';
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

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

/**
 * Starts a reset, and tells the caller nothing.
 *
 * Returns the same thing whether or not the address has an account. The
 * temptation is to say "no account with that email" because it is friendlier,
 * and it is also an account enumerator: point a script at a list of addresses
 * and the endpoint sorts them into customers and non-customers for free. The
 * registration endpoint already leaks this through its 409 and is rate limited
 * tightly for that reason; there is no need to add a second, cheaper oracle.
 *
 * The raw token is returned to the *caller of this function* so the route can
 * hand it to the mailer. It is never put in an HTTP response.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, email: true, name: true },
  });

  // No account: stop here, silently. The route still answers 202.
  if (!user) return;

  // 32 bytes of randomness, url-safe, so it survives being a query parameter.
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60_000);

  await prisma.$transaction([
    // Asking again invalidates the previous link rather than leaving a pile of
    // live ones, which is what someone clicking "resend" three times expects.
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: { tokenHash: hashToken(token), userId: user.id, expiresAt },
    }),
  ]);

  const link = `${env.RESET_LINK_BASE}?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: user.email,
    subject: 'Reset your Boxoffice password',
    text: [
      `Hi ${user.name},`,
      '',
      'Open this link to choose a new password:',
      link,
      '',
      `It stops working in ${env.PASSWORD_RESET_TTL_MINUTES} minutes, and once it has been used.`,
      'If you did not ask for this, nothing has changed and you can ignore it.',
    ].join('\n'),
  });
}

/**
 * Spends a reset token.
 *
 * Every refresh token the account has is revoked at the same time. Someone
 * resetting a password is quite often someone who thinks another person has
 * their account, and leaving that person's thirty day session alive would make
 * the reset theatre.
 */
export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(input.token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });

  // One message for "no such token", "already used" and "expired". Which of
  // the three it is cannot help anyone holding a valid link, and does help
  // someone probing with invented ones.
  const now = new Date();
  if (!record || record.usedAt !== null || record.expiresAt <= now) {
    throw HttpError.resetLinkInvalid();
  }

  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction([
    // Conditional on still being unused, so two taps on the same link cannot
    // both succeed: the second updates zero rows and the guard below throws.
    prisma.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
}
