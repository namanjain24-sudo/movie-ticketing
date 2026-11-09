import { z } from 'zod';
import { availabilityBandSchema, showFormatSchema } from './catalog';

/**
 * A watch party: a shortlist of showings and a tally of who can make each.
 *
 * The product already sells a ticket well. What it never helped with is the
 * half hour of messages before the ticket, which is where going to the cinema
 * with other people actually breaks down. So a plan agrees on a showing and
 * stops there: it holds no seats, takes no money, and when the group has
 * settled on one, somebody books it through the ordinary flow.
 *
 * Marks are "I could make this", not "this is my favourite", and more than one
 * is expected. A plan where everybody picked a different favourite has decided
 * nothing; a plan where four people all ticked Saturday 9pm has decided
 * something.
 */

export const planOptionSchema = z.object({
  id: z.string(),
  showtimeId: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  format: showFormatSchema,
  language: z.string(),
  currency: z.string(),
  fromPriceMinor: z.number().int(),
  availability: availabilityBandSchema,
  cinemaName: z.string(),
  /** How many members marked this one. */
  votes: z.number().int().nonnegative(),
  /** Whether the caller did. Absent as a concept for a signed-out reader. */
  youVoted: z.boolean(),
});
export type PlanOption = z.infer<typeof planOptionSchema>;

export const planSchema = z.object({
  code: z.string(),
  movie: z.object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    posterUrl: z.string(),
  }),
  city: z.string(),
  organiserName: z.string(),
  youAreOrganiser: z.boolean(),
  /**
   * Joining is separate from reading. Somebody handed the code can see the
   * plan before committing to being counted in it, and a tally only means
   * something against the number of people who said they were in.
   */
  youJoined: z.boolean(),
  memberCount: z.number().int().nonnegative(),
  /** When the last showing on the shortlist starts. */
  expiresAt: z.string(),
  /** True once that moment has passed: readable, not votable. */
  settled: z.boolean(),
  options: z.array(planOptionSchema),
});
export type Plan = z.infer<typeof planSchema>;

/**
 * At least two showings, because one is not a choice, and at most six, because
 * a shortlist nobody can hold in their head is the problem this replaces.
 */
export const createPlanSchema = z.object({
  movieId: z.string().min(1),
  showtimeIds: z.array(z.string().min(1)).min(2).max(6),
});
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

export const planVoteSchema = z.object({
  optionId: z.string().min(1),
});
export type PlanVoteInput = z.infer<typeof planVoteSchema>;

export const planListSchema = z.object({ plans: z.array(planSchema) });
export type PlanList = z.infer<typeof planListSchema>;

/**
 * The code's alphabet, which leaves out the characters people mis-copy.
 *
 * No O or 0, no I or 1, no S or 5. A code is read off one screen and typed
 * into another, often from a photograph of the first, and every one of those
 * pairs is a plan somebody cannot open.
 */
export const PLAN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXY2346789';
export const PLAN_CODE_LENGTH = 6;
