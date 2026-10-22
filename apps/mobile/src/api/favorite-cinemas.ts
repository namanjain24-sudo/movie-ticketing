import type { CinemaDirectoryEntry } from '@app/shared';
import { api } from './client';

export const favoriteCinemasApi = {
  list: () =>
    api
      .get<{ cinemas: CinemaDirectoryEntry[] }>('/v1/users/me/favorite-cinemas')
      .then((r) => r.cinemas),

  /** Idempotent: saving a cinema that is already saved changes nothing. */
  save: (idOrSlug: string) =>
    api.put<void>(`/v1/users/me/favorite-cinemas/${encodeURIComponent(idOrSlug)}`),

  remove: (idOrSlug: string) =>
    api.delete<void>(`/v1/users/me/favorite-cinemas/${encodeURIComponent(idOrSlug)}`),
};
