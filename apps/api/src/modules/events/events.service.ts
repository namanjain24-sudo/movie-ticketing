import type { EventDetail, EventList, EventSummary } from '@app/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { HttpError } from '../../http/errors';

/**
 * The live-events catalogue: matches, concerts, comedy, workshops, theatre.
 *
 * Reads only. Everything that *sells* a ticket — the seat map, the hold, the
 * payment, the booking — is shared with films and lives in its existing
 * module, because a showtime is a showtime whether the thing on is a film or
 * a Test match. This file is the part that differs: what you read before you
 * decide, and how you find it.
 */

const SUMMARY_SELECT = {
  id: true,
  slug: true,
  kind: true,
  title: true,
  tagline: true,
  posterUrl: true,
  durationMins: true,
  performers: true,
  organiser: true,
  tags: true,
  minAge: true,
} as const;

/**
 * The next occurrence of each event, and what the cheapest band costs there.
 *
 * One query for every event rather than one per event: a listing of a dozen
 * events would otherwise be a dozen round trips before anything renders, and
 * the N+1 would only show up once the catalogue grew.
 */
async function upcomingByEvent(eventIds: string[]): Promise<
  Map<
    string,
    {
      nextShowAt: Date;
      fromPriceMinor: number;
      venue: { id: string; name: string; city: string };
      cities: Set<string>;
    }
  >
> {
  if (eventIds.length === 0) return new Map();

  const shows = await prisma.showtime.findMany({
    where: {
      eventId: { in: eventIds },
      // Only what can still be bought. A fixture whose gates have closed is
      // not "next", and offering it would be the listing lying to a card.
      salesCloseAt: { gt: new Date() },
    },
    orderBy: { startsAt: 'asc' },
    select: {
      eventId: true,
      startsAt: true,
      tierPrices: { select: { priceMinor: true } },
      screen: { select: { cinema: { select: { id: true, name: true, city: true } } } },
    },
  });

  const out = new Map<
    string,
    {
      nextShowAt: Date;
      fromPriceMinor: number;
      venue: { id: string; name: string; city: string };
      cities: Set<string>;
    }
  >();

  for (const show of shows) {
    if (!show.eventId) continue;
    const venue = show.screen.cinema;
    const cheapest = Math.min(...show.tierPrices.map((t) => t.priceMinor));
    const existing = out.get(show.eventId);

    if (!existing) {
      out.set(show.eventId, {
        nextShowAt: show.startsAt,
        fromPriceMinor: cheapest,
        venue,
        cities: new Set([venue.city]),
      });
      continue;
    }

    // Shows arrive in time order, so the first one seen is the next one. The
    // rest only widen the city count and the "from" price, which is the
    // cheapest way in anywhere rather than the cheapest at the first venue.
    existing.cities.add(venue.city);
    if (cheapest < existing.fromPriceMinor) existing.fromPriceMinor = cheapest;
  }

  return out;
}

function toSummary(
  row: Prisma.EventGetPayload<{ select: typeof SUMMARY_SELECT }>,
  upcoming: Awaited<ReturnType<typeof upcomingByEvent>>,
): EventSummary {
  const next = upcoming.get(row.id);
  return {
    ...row,
    nextShowAt: next?.nextShowAt.toISOString() ?? null,
    fromPriceMinor: next?.fromPriceMinor ?? null,
    venue: next?.venue ?? null,
    cityCount: next?.cities.size ?? 0,
  };
}

/** Start and end of a local day, the same window the film listing uses. */
function dayWindow(date?: string): { start: Date; end: Date } | null {
  if (!date) return null;
  const start = new Date(`${date}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export async function listEvents(params: {
  kind?: EventSummary['kind'];
  city?: string;
  date?: string;
  q?: string;
}): Promise<EventList> {
  const window = dayWindow(params.date);

  /**
   * City and date are properties of a *show*, not of the event, so they
   * filter on whether any show matches rather than on a column. An event
   * playing Mumbai and Delhi is in both city listings, which is the only
   * answer that is not wrong.
   */
  const showFilter: Prisma.ShowtimeWhereInput | undefined =
    params.city || window
      ? {
          ...(params.city ? { screen: { cinema: { city: params.city } } } : {}),
          ...(window ? { startsAt: { gte: window.start, lt: window.end } } : {}),
          salesCloseAt: { gt: new Date() },
        }
      : undefined;

  const where: Prisma.EventWhereInput = {
    isPublished: true,
    ...(params.kind ? { kind: params.kind } : {}),
    ...(showFilter ? { showtimes: { some: showFilter } } : {}),
    ...(params.q
      ? {
          OR: [
            { title: { contains: params.q, mode: 'insensitive' } },
            { tagline: { contains: params.q, mode: 'insensitive' } },
            { performers: { has: params.q } },
            { tags: { has: params.q } },
          ],
        }
      : {}),
  };

  const rows = await prisma.event.findMany({
    where,
    orderBy: { title: 'asc' },
    select: SUMMARY_SELECT,
  });

  const upcoming = await upcomingByEvent(rows.map((r) => r.id));
  const events = rows.map((row) => toSummary(row, upcoming));

  /**
   * Which chips to offer, from the same filters minus the kind itself.
   * Offering "Workshops" when there is not a workshop on in the chosen city
   * is a filter that can only disappoint, so the chips are derived rather
   * than hard-coded.
   */
  const kindRows = await prisma.event.groupBy({
    by: ['kind'],
    where: { ...where, kind: undefined },
  });

  return {
    events: events.sort((a, b) => {
      // Soonest first, and anything with nothing left to sell at the end.
      if (a.nextShowAt && b.nextShowAt) return a.nextShowAt.localeCompare(b.nextShowAt);
      if (a.nextShowAt) return -1;
      if (b.nextShowAt) return 1;
      return a.title.localeCompare(b.title);
    }),
    availableKinds: kindRows.map((r) => r.kind),
  };
}

export async function getEvent(idOrSlug: string): Promise<EventDetail> {
  const row = await prisma.event.findFirst({
    where: { isPublished: true, OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: {
      ...SUMMARY_SELECT,
      description: true,
      backdropUrl: true,
      highlights: true,
    },
  });

  if (!row) throw HttpError.notFound('That event could not be found');

  const upcoming = await upcomingByEvent([row.id]);
  return {
    ...toSummary(row, upcoming),
    description: row.description,
    backdropUrl: row.backdropUrl,
    highlights: row.highlights,
  };
}

/** The cities this event is actually playing, for its own date/city picker. */
export async function listEventCities(eventId: string): Promise<string[]> {
  const rows = await prisma.showtime.findMany({
    where: { eventId, salesCloseAt: { gt: new Date() } },
    select: { screen: { select: { cinema: { select: { city: true } } } } },
    distinct: ['screenId'],
  });
  return [...new Set(rows.map((r) => r.screen.cinema.city))].sort();
}
