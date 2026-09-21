import type { Review, ReviewList, ReviewListQuery, UpsertReviewInput } from '@app/shared';
import { api } from './client';

export const reviewsApi = {
  /**
   * Sent with the access token on purpose: an authenticated caller gets their
   * own review flagged and hoisted, which is what lets the screen offer "edit
   * yours" without a second request.
   */
  list: (idOrSlug: string, query: ReviewListQuery) => {
    const search = new URLSearchParams({ sort: query.sort });
    if (query.rating !== undefined) search.set('rating', String(query.rating));
    return api.get<ReviewList>(
      `/v1/movies/${encodeURIComponent(idOrSlug)}/reviews?${search.toString()}`,
    );
  },

  /** Creates or replaces. One person has one review per film. */
  upsert: (idOrSlug: string, input: UpsertReviewInput) =>
    api.put<Review>(`/v1/movies/${encodeURIComponent(idOrSlug)}/reviews/me`, input),

  remove: (idOrSlug: string) =>
    api.delete<void>(`/v1/movies/${encodeURIComponent(idOrSlug)}/reviews/me`),
};
