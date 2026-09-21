import type { MovieSummary } from '@app/shared';
import { api } from './client';

export const watchlistApi = {
  list: () => api.get<{ movies: MovieSummary[] }>('/v1/users/me/watchlist').then((r) => r.movies),

  /** Idempotent: saving a film that is already saved changes nothing. */
  save: (idOrSlug: string) =>
    api.put<void>(`/v1/users/me/watchlist/${encodeURIComponent(idOrSlug)}`),

  remove: (idOrSlug: string) =>
    api.delete<void>(`/v1/users/me/watchlist/${encodeURIComponent(idOrSlug)}`),
};
