import type { ShowtimeSummary } from '@app/shared';
import { subjectOf, type Subject } from './subject';

/**
 * A venue's listing has no subject filter, so it can hold showtimes for
 * several different things at once — grouped by what is on, the way the film
 * page groups the opposite listing by cinema. Groups keep the order their
 * first showtime appeared in, which is the order the API already sorted by
 * time.
 *
 * Grouped by *subject* rather than by film, because a venue's listing can now
 * hold a match and a gig as easily as two films, and a stadium's can hold
 * nothing else.
 */
export function groupBySubject<T extends ShowtimeSummary>(
  showtimes: T[],
): { subject: Subject; showtimes: T[] }[] {
  const groups = new Map<string, { subject: Subject; showtimes: T[] }>();

  for (const showtime of showtimes) {
    const subject = subjectOf(showtime);
    // A showtime with neither a film nor an event cannot exist — the database
    // refuses it — but the type allows it, and dropping one is better than
    // rendering a group with no name on it.
    if (!subject) continue;

    const group = groups.get(subject.id) ?? { subject, showtimes: [] };
    group.showtimes.push(showtime);
    groups.set(subject.id, group);
  }

  return [...groups.values()];
}
