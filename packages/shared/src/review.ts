import { z } from 'zod';

/**
 * Ratings are whole stars, one to five.
 *
 * Half stars read as more precise than the judgement behind them, and the
 * moment the scale has ten points people stop agreeing on what each one means.
 * The bound is enforced here, at the route, and by the database, because a
 * rating of 9 would corrupt the average for as long as the row exists.
 */
export const RATING_MIN = 1;
export const RATING_MAX = 5;

/** Longest a review body may be. Roughly a paragraph, which is what these are. */
export const REVIEW_MAX_LENGTH = 1_000;

export const ratingSchema = z.coerce.number().int().min(RATING_MIN).max(RATING_MAX);

export const reviewSchema = z.object({
  id: z.string(),
  rating: ratingSchema,
  body: z.string().nullable(),
  /** Author's display name. Never their email: the list is public. */
  authorName: z.string(),
  /**
   * The author had a confirmed booking for this film. The app marks these,
   * because having seen the film is the only credential a film review has.
   */
  verified: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** True on the caller's own review, so the UI can offer to edit it. */
  mine: z.boolean(),
});
export type Review = z.infer<typeof reviewSchema>;

export const reviewListSchema = z.object({
  reviews: z.array(reviewSchema),
  /** The caller's own review, hoisted out so the screen need not scan for it. */
  mine: reviewSchema.nullable(),
  average: z.number().nullable(),
  count: z.number().int().nonnegative(),
  breakdown: z.array(z.object({ rating: ratingSchema, count: z.number().int().nonnegative() })),
  /**
   * Whether this caller may write one. False for a signed-out visitor, and
   * false again once they have, since editing replaces rather than adds.
   */
  canReview: z.boolean(),
});
export type ReviewList = z.infer<typeof reviewListSchema>;

export const REVIEW_SORTS = ['recent', 'helpful', 'highest', 'lowest'] as const;
export const reviewSortSchema = z.enum(REVIEW_SORTS);
export type ReviewSort = z.infer<typeof reviewSortSchema>;

export const REVIEW_SORT_LABELS: Record<ReviewSort, string> = {
  recent: 'Most recent',
  helpful: 'Verified first',
  highest: 'Highest rated',
  lowest: 'Lowest rated',
};

export const reviewListQuerySchema = z.object({
  sort: reviewSortSchema.default('helpful'),
  /** Show only reviews at this star count, for reading the one-star pile. */
  rating: ratingSchema.optional(),
});
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;

/**
 * Writing a review. The same payload creates and updates, because one person
 * has one review per film — there is no second thing to create.
 */
export const upsertReviewSchema = z.object({
  rating: ratingSchema,
  body: z
    .string()
    .trim()
    .max(REVIEW_MAX_LENGTH, `Keep it under ${REVIEW_MAX_LENGTH} characters`)
    // An empty box and no box are the same statement: a rating with no words.
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional(),
});
export type UpsertReviewInput = z.infer<typeof upsertReviewSchema>;

/** Star label for screen readers, where a row of glyphs reads as nothing. */
export function ratingLabel(rating: number): string {
  return `${rating} out of ${RATING_MAX} stars`;
}
