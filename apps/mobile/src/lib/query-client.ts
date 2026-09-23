import type {
  CinemaListQuery,
  MovieListQuery,
  ReviewListQuery,
  ShowtimeListQuery,
} from '@app/shared';
import { QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from '../api/client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      // A 401 has already been through one silent refresh by the time it lands
      // here, and a 4xx will not fix itself, so only retry transient failures.
      retry: (failureCount, error) => {
        if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: {
      retry: false,
    },
  },
});

export const queryKeys = {
  me: ['me'] as const,
  cities: ['cities'] as const,
  comingSoon: ['movies', 'coming-soon'] as const,
  movies: (query: MovieListQuery = {}) => ['movies', query] as const,
  movie: (idOrSlug: string) => ['movie', idOrSlug] as const,
  reviews: (idOrSlug: string, query: ReviewListQuery) => ['reviews', idOrSlug, query] as const,
  cinemas: (query: CinemaListQuery = {}) => ['cinemas', query] as const,
  cinemaBrands: ['cinema-brands'] as const,
  cinema: (idOrSlug: string) => ['cinema', idOrSlug] as const,
  showtimes: (query: ShowtimeListQuery = {}) => ['showtimes', query] as const,
  seatMap: (showtimeId: string) => ['seatmap', showtimeId] as const,
  watchlist: ['watchlist'] as const,
  promoOffers: ['promo-offers'] as const,
  concessions: ['concessions'] as const,
  bookings: ['bookings'] as const,
  booking: (reference: string) => ['booking', reference] as const,
  cancellationQuote: (bookingId: string) => ['cancellation', bookingId] as const,
  hold: (holdId: string) => ['hold', holdId] as const,
  payment: (paymentId: string) => ['payment', paymentId] as const,
};
