import { EVENT_KIND_SINGULAR, type EventKind } from '@app/shared';

/**
 * What a show is *for*.
 *
 * A showtime, a seat map and a booking all carry a film or an event and never
 * both — the database enforces that with a check constraint. Every screen
 * that renders a title, a poster or a link therefore has the same two-branch
 * question to answer, and before this helper existed it was answered
 * separately in a dozen places, all of which the compiler flagged the moment
 * `movie` became nullable.
 *
 * One answer, in one place. The shapes are deliberately minimal because the
 * three payloads carry slightly different fields — a booking's film has no
 * slug, for instance — and this only needs what every screen actually shows.
 */
export interface Subject {
  /** `FILM`, or the event's own kind. */
  kind: 'FILM' | EventKind;
  id: string;
  title: string;
  posterUrl: string;
  /**
   * Where tapping it goes. Null for a film known only by id — a booking's
   * film carries no slug, and the film route wants one.
   */
  href: string | null;
  /** "Film", "Match", "Workshop" — for a line under the title. */
  kindLabel: string;
}

interface SubjectCarrier {
  movie: { id: string; slug?: string; title: string; posterUrl: string } | null;
  event: { id: string; slug: string; kind: EventKind; title: string; posterUrl: string } | null;
}

/**
 * Null only if a payload somehow has neither, which the database will not
 * allow. Callers treat it as "nothing to show" rather than throwing, because
 * a screen that cannot name the film is still a screen with a seat map on it.
 */
export function subjectOf(carrier: SubjectCarrier): Subject | null {
  if (carrier.event) {
    return {
      kind: carrier.event.kind,
      id: carrier.event.id,
      title: carrier.event.title,
      posterUrl: carrier.event.posterUrl,
      href: `/event/${carrier.event.slug}`,
      kindLabel: EVENT_KIND_SINGULAR[carrier.event.kind],
    };
  }

  if (carrier.movie) {
    return {
      kind: 'FILM',
      id: carrier.movie.id,
      title: carrier.movie.title,
      posterUrl: carrier.movie.posterUrl,
      href: carrier.movie.slug ? `/movie/${carrier.movie.slug}` : null,
      kindLabel: 'Film',
    };
  }

  return null;
}

/** The title alone, for the many places that want only that. */
export function subjectTitle(carrier: SubjectCarrier): string {
  return subjectOf(carrier)?.title ?? '';
}

/** The poster alone. */
export function subjectPoster(carrier: SubjectCarrier): string | null {
  return subjectOf(carrier)?.posterUrl ?? null;
}
