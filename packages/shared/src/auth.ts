import { z } from 'zod';
import { userSchema } from './user';

/**
 * Password policy lives here so the sign-up form and the API can never drift
 * apart. Change it once and both sides move together.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Password is too long')
  .refine((v) => /[a-z]/.test(v), 'Add a lowercase letter')
  .refine((v) => /[A-Z]/.test(v), 'Add an uppercase letter')
  .refine((v) => /[0-9]/.test(v), 'Add a number');

export const emailSchema = z
  .email('Enter a valid email')
  .max(254)
  .transform((v) => v.trim().toLowerCase());

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1, 'Name is required').max(80, 'Name is too long'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Seconds until `accessToken` expires, from the moment the response was sent. */
  expiresIn: z.number().int().positive(),
});
export type TokenPair = z.infer<typeof tokenPairSchema>;

export const authResponseSchema = z.object({
  user: userSchema,
  tokens: tokenPairSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const accessTokenClaimsSchema = z.object({
  sub: z.string(),
  type: z.literal('access'),
});

export const refreshTokenClaimsSchema = z.object({
  sub: z.string(),
  type: z.literal('refresh'),
  /** Rotation id — lets the server revoke a single refresh token. */
  jti: z.string(),
});
