import type { ShowtimeSummary } from '@app/shared';

/**
 * A venue's listing has no `movieId` filter, so it can hold showtimes for
 * several different films at once — grouped by film, the way the film page
 * groups the opposite listing by cinema. Groups keep the order their first
 * showtime appeared in, which is the order the API already sorted by time.
 */
export function groupByMovie<T extends ShowtimeSummary>(
  showtimes: T[],
): { movie: ShowtimeSummary['movie']; showtimes: T[] }[] {
  const groups = new Map<string, { movie: ShowtimeSummary['movie']; showtimes: T[] }>();
  for (const showtime of showtimes) {
    const group = groups.get(showtime.movie.id) ?? { movie: showtime.movie, showtimes: [] };
    group.showtimes.push(showtime);
    groups.set(showtime.movie.id, group);
  }
  return [...groups.values()];
}
