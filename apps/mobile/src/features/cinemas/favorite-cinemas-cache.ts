import type { CinemaDirectoryEntry } from '@app/shared';

/**
 * The two edits an optimistic toggle makes to the cached list. Pure, mirrors
 * watchlist-cache.ts exactly, so the rules can be tested without a network or
 * a query client.
 */

/** Newest first, matching the server's order; a cinema already present is not doubled. */
export function withSavedCinema(
  list: CinemaDirectoryEntry[] | undefined,
  cinema: CinemaDirectoryEntry,
): CinemaDirectoryEntry[] {
  const rest = (list ?? []).filter((c) => c.id !== cinema.id);
  return [cinema, ...rest];
}

export function withoutSavedCinema(
  list: CinemaDirectoryEntry[] | undefined,
  cinemaId: string,
): CinemaDirectoryEntry[] {
  return (list ?? []).filter((c) => c.id !== cinemaId);
}
