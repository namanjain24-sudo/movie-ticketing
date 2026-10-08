import type { SeatTier } from '@app/shared';

/**
 * The films the demo catalogue is built from.
 *
 * Titles, runtimes, certifications, languages and genres are curated here
 * rather than fetched, because the free endpoints that carry synopses and
 * artwork do not carry structured metadata, and guessing it from prose would
 * be worse than stating what is known.
 *
 * Synopsis and poster come from the network at build time — see
 * `scripts/fetch-catalogue.ts`, which caches the result to `catalogue.json` so
 * seeding stays reproducible and works offline.
 *
 * Kept to films actually in theatres (or genuinely unreleased) as of when
 * this list was last refreshed, rather than a fixed roster: a "coming soon"
 * rail with a decades-old classic on it reads as placeholder data the moment
 * anyone looks closely, which defeats the point of a catalogue meant to look
 * real. When this list is stale enough to need replacing, update the titles
 * here, then run `npm run catalogue && npm run db:seed` to refetch artwork
 * and synopses and reseed.
 */
export interface FilmSource {
  slug: string;
  title: string;
  /** Wikipedia article title, used by the keyless fallback. */
  wikipedia: string;
  /** Title and year handed to TMDB when a key is configured. */
  tmdbQuery: { query: string; year: number };
  durationMins: number;
  certification: string;
  languages: string[];
  genres: string[];
}

export const NOW_SHOWING: FilmSource[] = [
  {
    slug: 'drishyam-the-conclusion',
    title: 'Drishyam: The Conclusion',
    wikipedia: 'Drishyam:_The_Conclusion',
    tmdbQuery: { query: 'Drishyam: The Conclusion', year: 2026 },
    durationMins: 150,
    certification: 'UA',
    languages: ['Hindi'],
    genres: ['Crime', 'Thriller'],
  },
  {
    slug: 'verity',
    title: 'Verity',
    wikipedia: 'Verity_(film)',
    tmdbQuery: { query: 'Verity', year: 2026 },
    durationMins: 117,
    certification: 'A',
    languages: ['English'],
    genres: ['Thriller', 'Drama'],
  },
  {
    slug: 'resident-evil',
    title: 'Resident Evil',
    wikipedia: 'Resident_Evil_(2026_film)',
    tmdbQuery: { query: 'Resident Evil', year: 2026 },
    durationMins: 94,
    certification: 'A',
    languages: ['English'],
    genres: ['Horror'],
  },
  {
    slug: 'vibe',
    title: 'Vibe',
    wikipedia: 'Vibe_(film)',
    tmdbQuery: { query: 'Vibe', year: 2026 },
    durationMins: 145,
    certification: 'A',
    languages: ['Hindi'],
    genres: ['Action', 'Comedy'],
  },
  {
    slug: 'forgotten-island',
    title: 'Forgotten Island',
    wikipedia: 'Forgotten_Island',
    tmdbQuery: { query: 'Forgotten Island', year: 2026 },
    durationMins: 109,
    certification: 'U',
    languages: ['English', 'Hindi'],
    genres: ['Animation', 'Fantasy', 'Comedy'],
  },
  {
    slug: 'the-paradise',
    title: 'The Paradise',
    wikipedia: 'The_Paradise_(2026_film)',
    tmdbQuery: { query: 'The Paradise', year: 2026 },
    durationMins: 174,
    certification: 'A',
    languages: ['Telugu'],
    genres: ['Action', 'Drama'],
  },
  {
    slug: 'sardar-2',
    title: 'Sardar 2',
    wikipedia: 'Sardar_2',
    tmdbQuery: { query: 'Sardar 2', year: 2026 },
    durationMins: 179,
    certification: 'UA',
    languages: ['Tamil'],
    genres: ['Action', 'Science Fiction', 'Thriller'],
  },
];

export const COMING_SOON: FilmSource[] = [
  {
    slug: 'jailer-2',
    title: 'Jailer 2',
    wikipedia: 'Jailer_2',
    tmdbQuery: { query: 'Jailer 2', year: 2026 },
    durationMins: 165,
    certification: 'UA',
    languages: ['Tamil'],
    genres: ['Action', 'Comedy'],
  },
  {
    slug: 'street-fighter',
    title: 'Street Fighter',
    wikipedia: 'Street_Fighter_(2026_film)',
    tmdbQuery: { query: 'Street Fighter', year: 2026 },
    durationMins: 119,
    certification: 'UA',
    languages: ['English'],
    genres: ['Action', 'Comedy'],
  },
  {
    slug: 'ramayana-rise-of-a-legend',
    title: 'Ramayana: Rise of a Legend',
    wikipedia: 'Ramayana:_Rise_of_a_Legend',
    tmdbQuery: { query: 'Ramayana: Rise of a Legend', year: 2026 },
    durationMins: 170,
    certification: 'UA',
    languages: ['Hindi', 'English'],
    genres: ['Fantasy', 'Action', 'Adventure', 'Drama'],
  },
];

/** Screens are priced by tier; unchanged by where the film data comes from. */
export type { SeatTier };
