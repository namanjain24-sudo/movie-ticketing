import { z } from 'zod';

/**
 * Everything ticketed that is not a film.
 *
 * A sibling of the film catalogue rather than a replacement for it. The
 * booking mechanic underneath — seat inventory, holds, payment, the ticket —
 * is shared with films and entirely unchanged, because it only ever knows a
 * showtime id. What differs between a match and a gig is what you read before
 * you buy, and that is all this file describes.
 */
export const EVENT_KINDS = ['SPORT', 'CONCERT', 'COMEDY', 'WORKSHOP', 'THEATRE'] as const;
export const eventKindSchema = z.enum(EVENT_KINDS);
export type EventKind = z.infer<typeof eventKindSchema>;

/** Plural, for a filter chip or a section heading. */
export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  SPORT: 'Sports',
  CONCERT: 'Concerts',
  COMEDY: 'Comedy',
  WORKSHOP: 'Workshops',
  THEATRE: 'Theatre',
};

/** Singular, for "1 concert" or a line under a title. */
export const EVENT_KIND_SINGULAR: Record<EventKind, string> = {
  SPORT: 'Match',
  CONCERT: 'Concert',
  COMEDY: 'Comedy show',
  WORKSHOP: 'Workshop',
  THEATRE: 'Play',
};

/**
 * What the `performers` list means for each kind, so a screen can label it
 * without a switch of its own. For a match it is the two sides, in order.
 */
export const EVENT_PERFORMER_LABELS: Record<EventKind, string> = {
  SPORT: 'Teams',
  CONCERT: 'Line-up',
  COMEDY: 'Performing',
  WORKSHOP: 'Led by',
  THEATRE: 'Cast',
};

/** What `organiser` means for each kind. */
export const EVENT_ORGANISER_LABELS: Record<EventKind, string> = {
  SPORT: 'Tournament',
  CONCERT: 'Tour',
  COMEDY: 'Presented by',
  WORKSHOP: 'Hosted by',
  THEATRE: 'Produced by',
};

/** What `highlights` means for each kind. */
export const EVENT_HIGHLIGHT_LABELS: Record<EventKind, string> = {
  SPORT: 'Match info',
  CONCERT: 'Good to know',
  COMEDY: 'Good to know',
  WORKSHOP: "What you'll learn",
  THEATRE: 'Good to know',
};

export const VENUE_KINDS = ['CINEMA', 'STADIUM', 'ARENA', 'THEATRE', 'STUDIO', 'OUTDOOR'] as const;
export const venueKindSchema = z.enum(VENUE_KINDS);
export type VenueKind = z.infer<typeof venueKindSchema>;

/**
 * What a venue calls its seated spaces, and what it has on.
 *
 * A cinema has screens and films; a ground has stands and matches. The venue
 * card printed "1 screen · 1 films on" for Wankhede until these existed,
 * which is three wrong words in six.
 */
export const VENUE_SPACE_LABELS: Record<VenueKind, { one: string; many: string }> = {
  CINEMA: { one: 'screen', many: 'screens' },
  STADIUM: { one: 'stand', many: 'stands' },
  ARENA: { one: 'hall', many: 'halls' },
  THEATRE: { one: 'stage', many: 'stages' },
  STUDIO: { one: 'room', many: 'rooms' },
  OUTDOOR: { one: 'area', many: 'areas' },
};

/** What is on there: films at a cinema, events everywhere else. */
export const VENUE_PROGRAMME_LABELS: Record<VenueKind, { one: string; many: string }> = {
  CINEMA: { one: 'film', many: 'films' },
  STADIUM: { one: 'fixture', many: 'fixtures' },
  ARENA: { one: 'show', many: 'shows' },
  THEATRE: { one: 'show', many: 'shows' },
  STUDIO: { one: 'session', many: 'sessions' },
  OUTDOOR: { one: 'event', many: 'events' },
};

export const VENUE_KIND_LABELS: Record<VenueKind, string> = {
  CINEMA: 'Cinema',
  STADIUM: 'Stadium',
  ARENA: 'Arena',
  THEATRE: 'Theatre',
  STUDIO: 'Studio',
  OUTDOOR: 'Open air',
};

export const eventSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  kind: eventKindSchema,
  title: z.string(),
  tagline: z.string().nullable(),
  posterUrl: z.string(),
  durationMins: z.number().int(),
  performers: z.array(z.string()),
  organiser: z.string().nullable(),
  tags: z.array(z.string()),
  minAge: z.number().int().nullable(),
  /**
   * The next show, and what it costs, so a card can say "Sat, 2 Nov · from
   * ₹900" without a second request per event. Null when every show has
   * already started — such an event is still listed so a link to it keeps
   * working, but it has nothing left to sell.
   */
  nextShowAt: z.string().nullable(),
  fromPriceMinor: z.number().int().nullable(),
  /** Where the next show is. Null for the same reason `nextShowAt` is. */
  venue: z.object({ id: z.string(), name: z.string(), city: z.string() }).nullable(),
  /** How many distinct cities this event is playing in, across all its shows. */
  cityCount: z.number().int().nonnegative(),
});
export type EventSummary = z.infer<typeof eventSummarySchema>;

export const eventDetailSchema = eventSummarySchema.extend({
  description: z.string(),
  backdropUrl: z.string().nullable(),
  highlights: z.array(z.string()),
});
export type EventDetail = z.infer<typeof eventDetailSchema>;

export const eventListQuerySchema = z.object({
  kind: eventKindSchema.optional(),
  city: z.string().trim().min(1).optional(),
  /** `YYYY-MM-DD`, in the venue's own day. Matches shows on that date. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  q: z.string().trim().min(1).max(80).optional(),
});
export type EventListQuery = z.infer<typeof eventListQuerySchema>;

export const eventListSchema = z.object({
  events: z.array(eventSummarySchema),
  /** The kinds that actually have something on, so the chips can be honest. */
  availableKinds: z.array(eventKindSchema),
});
export type EventList = z.infer<typeof eventListSchema>;
