import { z } from 'zod';
import { userSchema } from './user';

/**
 * Password policy lives here so the sign-up form and the API can never drift
 * apart. Change it once and both sides move together.
 *
 * The rules are data rather than a chain of `.refine()` calls because the
 * sign-up form shows them as a checklist that ticks off while somebody types.
 * Written twice — once to enforce, once to display — they would eventually
 * disagree, and a form that promises a rule the server does not keep (or
 * hides one it does) is worse than no checklist at all. `passwordSchema` is
 * built from this list, so the two cannot come apart.
 *
 * `label` is what the rule looks like when it is a goal ("A number"), and
 * `message` is what it sounds like when it has been broken ("Add a number").
 */
export const PASSWORD_RULES = [
  {
    id: 'length',
    label: 'At least 10 characters',
    message: 'Use at least 10 characters',
    test: (v: string) => v.length >= 10,
  },
  {
    id: 'lowercase',
    label: 'A lowercase letter',
    message: 'Add a lowercase letter',
    test: (v: string) => /[a-z]/.test(v),
  },
  {
    id: 'uppercase',
    label: 'An uppercase letter',
    message: 'Add an uppercase letter',
    test: (v: string) => /[A-Z]/.test(v),
  },
  {
    id: 'number',
    label: 'A number',
    message: 'Add a number',
    test: (v: string) => /[0-9]/.test(v),
  },
] as const;

export type PasswordRule = (typeof PASSWORD_RULES)[number];

/** Which rules this password has not met yet, in the order they are shown. */
export function unmetPasswordRules(value: string): PasswordRule[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(value));
}

export const passwordSchema = PASSWORD_RULES.reduce(
  // Typed as `z.ZodString`'s own refine result rather than `z.ZodType<string>`:
  // the latter widens the schema's *input* to unknown, which propagates into
  // `registerSchema` and makes `password` unknown at every call site.
  (schema: z.ZodType<string, string>, rule) => schema.refine(rule.test, rule.message),
  // The upper bound is not in the list: it is a limit rather than a goal, and
  // a checklist item reading "fewer than 128 characters" is noise on a form
  // nobody is going to fail it on.
  z.string().max(128, 'Password is too long'),
);

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

/**
 * Asking for a reset. Only an email, and the response never says whether that
 * email has an account: a reset endpoint that answers that question is an
 * account enumerator with extra steps.
 */
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/** Spending a reset token. The token is single use and short lived. */
export const resetPasswordSchema = z.object({
  token: z.string().min(16, 'That reset link is not valid'),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

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
