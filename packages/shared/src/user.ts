import { z } from 'zod';

export const userSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string().min(1).max(80),
  avatarUrl: z.url().nullable(),
  createdAt: z.iso.datetime(),
});
export type User = z.infer<typeof userSchema>;

export const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(80, 'Name is too long').optional(),
  avatarUrl: z.url('Must be a valid URL').nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
