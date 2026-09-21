import type { Cinema, CinemaDirectoryEntry, CinemaListQuery } from '@app/shared';
import { api } from './client';

export const cinemasApi = {
  /**
   * The venue directory. Passing a position adds a distance to every entry and
   * sorts by it — the server does the arithmetic so every client agrees on
   * what "nearest" means.
   */
  list: (query: CinemaListQuery = {}) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === '') continue;
      search.set(key, String(value));
    }
    const encoded = search.toString();
    return api
      .get<{ cinemas: CinemaDirectoryEntry[] }>(`/v1/cinemas${encoded ? `?${encoded}` : ''}`)
      .then((r) => r.cinemas);
  },

  brands: () => api.get<{ brands: string[] }>('/v1/cinema-brands').then((r) => r.brands),

  get: (idOrSlug: string) => api.get<Cinema>(`/v1/cinemas/${encodeURIComponent(idOrSlug)}`),
};
