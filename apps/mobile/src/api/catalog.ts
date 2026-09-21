import type {
  CinemaShowtimes,
  MovieDetail,
  MovieListQuery,
  MovieSummary,
  SeatMap,
  ShowtimeListQuery,
} from '@app/shared';
import { api } from './client';

/** Drops undefined and empty values so the URL carries only real filters. */
function queryString(params: Record<string, string | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === false || value === '') continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

export const catalogApi = {
  cities: () => api.get<{ cities: string[] }>('/v1/cities').then((r) => r.cities),

  movies: (query: MovieListQuery = {}) =>
    api.get<{ movies: MovieSummary[] }>(`/v1/movies${queryString(query)}`).then((r) => r.movies),

  /** Announced, not yet bookable. Its own call, because it is its own list. */
  comingSoon: () =>
    api
      .get<{ movies: MovieSummary[] }>(`/v1/movies${queryString({ comingSoon: true })}`)
      .then((r) => r.movies),

  movie: (idOrSlug: string) => api.get<MovieDetail>(`/v1/movies/${encodeURIComponent(idOrSlug)}`),

  showtimes: (query: ShowtimeListQuery = {}) =>
    api
      .get<{ cinemas: CinemaShowtimes[] }>(`/v1/showtimes${queryString(query)}`)
      .then((r) => r.cinemas),

  /**
   * Sent with the access token on purpose: an authenticated caller gets their
   * own held seats back as `HELD_BY_YOU` rather than as taken by a stranger.
   */
  seatMap: (showtimeId: string) =>
    api.get<SeatMap>(`/v1/showtimes/${encodeURIComponent(showtimeId)}/seatmap`),
};
