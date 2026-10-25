import type { CinemaShowtimes, EventDetail, EventList, EventListQuery } from '@app/shared';
import { api } from './client';

/** Drops undefined and empty values so the URL carries only real filters. */
function queryString(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, value);
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

export const eventsApi = {
  list: (query: EventListQuery = {}) => api.get<EventList>(`/v1/events${queryString(query)}`),

  detail: (idOrSlug: string) => api.get<EventDetail>(`/v1/events/${encodeURIComponent(idOrSlug)}`),

  cities: (eventId: string) =>
    api
      .get<{ cities: string[] }>(`/v1/events/${encodeURIComponent(eventId)}/cities`)
      .then((r) => r.cities),

  /**
   * Shows grouped by venue — the same shape a film's showtimes come back in,
   * because it is the same endpoint underneath and the same picker renders it.
   */
  shows: (eventId: string, query: { city?: string; date?: string } = {}) =>
    api
      .get<{ venues: CinemaShowtimes[] }>(
        `/v1/events/${encodeURIComponent(eventId)}/shows${queryString(query)}`,
      )
      .then((r) => r.venues),
};
