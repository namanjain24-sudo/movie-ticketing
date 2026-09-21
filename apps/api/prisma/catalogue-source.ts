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
    slug: 'jawan',
    title: 'Jawan',
    wikipedia: 'Jawan_(film)',
    tmdbQuery: { query: 'Jawan', year: 2023 },
    durationMins: 169,
    certification: 'UA',
    languages: ['Hindi', 'Tamil', 'Telugu'],
    genres: ['Action', 'Thriller'],
  },
  {
    slug: 'pathaan',
    title: 'Pathaan',
    wikipedia: 'Pathaan_(film)',
    tmdbQuery: { query: 'Pathaan', year: 2023 },
    durationMins: 146,
    certification: 'UA',
    languages: ['Hindi'],
    genres: ['Action', 'Thriller'],
  },
  {
    slug: '12th-fail',
    title: '12th Fail',
    wikipedia: '12th_Fail',
    tmdbQuery: { query: '12th Fail', year: 2023 },
    durationMins: 147,
    certification: 'U',
    languages: ['Hindi'],
    genres: ['Drama', 'Biography'],
  },
  {
    slug: 'laapataa-ladies',
    title: 'Laapataa Ladies',
    wikipedia: 'Laapataa_Ladies',
    tmdbQuery: { query: 'Laapataa Ladies', year: 2023 },
    durationMins: 122,
    certification: 'U',
    languages: ['Hindi'],
    genres: ['Comedy', 'Drama'],
  },
  {
    slug: 'animal',
    title: 'Animal',
    wikipedia: 'Animal_(2023_Indian_film)',
    tmdbQuery: { query: 'Animal', year: 2023 },
    durationMins: 201,
    certification: 'A',
    languages: ['Hindi', 'Telugu'],
    genres: ['Action', 'Crime', 'Drama'],
  },
  {
    slug: 'stree-2',
    title: 'Stree 2',
    wikipedia: 'Stree_2',
    tmdbQuery: { query: 'Stree 2', year: 2024 },
    durationMins: 149,
    certification: 'UA',
    languages: ['Hindi'],
    genres: ['Horror', 'Comedy'],
  },
  {
    slug: 'kalki-2898-ad',
    title: 'Kalki 2898 AD',
    wikipedia: 'Kalki_2898_AD',
    tmdbQuery: { query: 'Kalki 2898 AD', year: 2024 },
    durationMins: 181,
    certification: 'UA',
    languages: ['Telugu', 'Hindi'],
    genres: ['Science Fiction', 'Action'],
  },
  {
    slug: 'dune-part-two',
    title: 'Dune: Part Two',
    wikipedia: 'Dune:_Part_Two',
    tmdbQuery: { query: 'Dune: Part Two', year: 2024 },
    durationMins: 166,
    certification: 'UA',
    languages: ['English'],
    genres: ['Science Fiction', 'Adventure'],
  },
  {
    slug: 'oppenheimer',
    title: 'Oppenheimer',
    wikipedia: 'Oppenheimer_(film)',
    tmdbQuery: { query: 'Oppenheimer', year: 2023 },
    durationMins: 180,
    certification: 'A',
    languages: ['English'],
    genres: ['Drama', 'Biography'],
  },
  {
    slug: 'inside-out-2',
    title: 'Inside Out 2',
    wikipedia: 'Inside_Out_2',
    tmdbQuery: { query: 'Inside Out 2', year: 2024 },
    durationMins: 96,
    certification: 'U',
    languages: ['English', 'Hindi'],
    genres: ['Animation', 'Family'],
  },
  {
    slug: '3-idiots',
    title: '3 Idiots',
    wikipedia: '3_Idiots',
    tmdbQuery: { query: '3 Idiots', year: 2009 },
    durationMins: 170,
    certification: 'U',
    languages: ['Hindi'],
    genres: ['Comedy', 'Drama'],
  },
  {
    slug: 'interstellar',
    title: 'Interstellar',
    wikipedia: 'Interstellar_(film)',
    tmdbQuery: { query: 'Interstellar', year: 2014 },
    durationMins: 169,
    certification: 'UA',
    languages: ['English'],
    genres: ['Science Fiction', 'Drama'],
  },
];

export const COMING_SOON: FilmSource[] = [
  {
    slug: 'the-godfather',
    title: 'The Godfather',
    wikipedia: 'The_Godfather',
    tmdbQuery: { query: 'The Godfather', year: 1972 },
    durationMins: 175,
    certification: 'A',
    languages: ['English'],
    genres: ['Crime', 'Drama'],
  },
  {
    slug: 'spirited-away',
    title: 'Spirited Away',
    wikipedia: 'Spirited_Away',
    tmdbQuery: { query: 'Spirited Away', year: 2001 },
    durationMins: 125,
    certification: 'U',
    languages: ['Japanese', 'English'],
    genres: ['Animation', 'Fantasy'],
  },
  {
    slug: 'sholay',
    title: 'Sholay',
    wikipedia: 'Sholay',
    tmdbQuery: { query: 'Sholay', year: 1975 },
    durationMins: 204,
    certification: 'UA',
    languages: ['Hindi'],
    genres: ['Action', 'Adventure'],
  },
];

/** Screens are priced by tier; unchanged by where the film data comes from. */
export type { SeatTier };
