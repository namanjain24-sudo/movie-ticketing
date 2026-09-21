import type { MovieSummary } from '@app/shared';

/**
 * The two edits an optimistic toggle makes to the cached list. Pure, so the
 * rules that decide what the screen shows before the server answers can be
 * tested without a network or a query client.
 */

/** Newest first, matching the server's order; a film already present is not doubled. */
export function withSaved(list: MovieSummary[] | undefined, movie: MovieSummary): MovieSummary[] {
  const rest = (list ?? []).filter((m) => m.id !== movie.id);
  return [movie, ...rest];
}

export function withoutSaved(list: MovieSummary[] | undefined, movieId: string): MovieSummary[] {
  return (list ?? []).filter((m) => m.id !== movieId);
}
