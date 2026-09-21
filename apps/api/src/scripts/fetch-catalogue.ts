/**
 * Builds the demo catalogue from real film data and caches it to
 * `prisma/catalogue.json`.
 *
 * Two sources, in order of preference:
 *
 *  - **TMDB**, when `TMDB_API_KEY` is set. The right answer for a ticketing
 *    app: it carries posters *and* backdrops, its terms cover this use with
 *    attribution, and the images come off a CDN built to serve them.
 *  - **Wikipedia's REST summary**, otherwise. Keyless, so the repo works the
 *    moment it is cloned. It gives a real synopsis and the article's lead
 *    image, which for a film is usually its poster — those are non-free
 *    fair-use files, fine for a local demo and not something to ship.
 *
 * The result is cached rather than fetched at seed time, so `npm run db:seed`
 * stays reproducible, fast, and works with no network at all.
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { COMING_SOON, NOW_SHOWING, type FilmSource } from '../../prisma/catalogue-source';

const OUT = resolve(import.meta.dirname, '../../prisma/catalogue.json');
const TMDB_KEY = process.env.TMDB_API_KEY?.trim();
const TMDB_IMAGE = 'https://image.tmdb.org/t/p';

/**
 * Poster width in pixels.
 *
 * A poster is drawn about 180pt wide in the grid and about 300pt on the detail
 * screen. At 3x that is 900 device pixels, so anything under that is being
 * upscaled — which is exactly what the Wikipedia fallback does, and exactly
 * what it looks like. 780 covers the grid outright and is close enough on the
 * detail screen to read as a photograph rather than as a JPEG.
 */
const POSTER_SIZE = 'w780';

/** Backdrops are drawn full-bleed, so they get the widest non-original size. */
const BACKDROP_SIZE = 'w1280';

/**
 * TMDB has two credentials and they authenticate differently. The v4 "read
 * access token" is a long JWT and goes in an Authorization header; the v3 "API
 * key" is a 32-character hex string and goes in the query. Sending one as the
 * other returns 401 with a message about the *other* scheme, which is a
 * genuinely confusing half hour. Accept both and pick by shape.
 */
function tmdbAuth(key: string): { headers: Record<string, string>; query: Record<string, string> } {
  const looksLikeV4 = key.split('.').length === 3;
  return looksLikeV4
    ? { headers: { authorization: `Bearer ${key}` }, query: {} }
    : { headers: {}, query: { api_key: key } };
}

export interface CatalogueEntry extends FilmSource {
  synopsis: string;
  posterUrl: string;
  backdropUrl: string | null;
  /** Which source actually answered, recorded so the cache is auditable. */
  source: 'tmdb' | 'wikipedia' | 'placeholder';
}

const placeholder = (title: string, size: string, tone: string) =>
  `https://placehold.co/${size}/${tone}/f9fafb?text=${encodeURIComponent(title)}`;

async function getJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'ticketing-demo/1.0', ...headers },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function fromTmdb(film: FilmSource): Promise<CatalogueEntry | null> {
  const auth = tmdbAuth(TMDB_KEY!);
  const params = new URLSearchParams({
    query: film.tmdbQuery.query,
    year: String(film.tmdbQuery.year),
    include_adult: 'false',
    ...auth.query,
  });
  const search = (await getJson(
    `https://api.themoviedb.org/3/search/movie?${params}`,
    auth.headers,
  )) as { results?: { overview?: string; poster_path?: string; backdrop_path?: string }[] };

  const hit = search.results?.[0];
  if (!hit?.poster_path) return null;

  return {
    ...film,
    synopsis: hit.overview?.trim() || `${film.title} is now showing.`,
    posterUrl: `${TMDB_IMAGE}/${POSTER_SIZE}${hit.poster_path}`,
    backdropUrl: hit.backdrop_path ? `${TMDB_IMAGE}/${BACKDROP_SIZE}${hit.backdrop_path}` : null,
    source: 'tmdb',
  };
}

async function fromWikipedia(film: FilmSource): Promise<CatalogueEntry | null> {
  const data = (await getJson(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${film.wikipedia}`,
  )) as {
    type?: string;
    extract?: string;
    originalimage?: { source?: string };
    thumbnail?: { source?: string };
  };

  // A disambiguation page answers 200 with prose that is not a synopsis. It
  // has to be rejected here or it lands in the catalogue looking plausible.
  if (data.type === 'disambiguation') return null;

  const extract = data.extract?.trim();
  if (!extract) return null;

  // Wikipedia appends its own analytics params to the image URL. They are not
  // part of the resource and some clients choke on them, so strip them.
  const raw = data.originalimage?.source ?? data.thumbnail?.source ?? null;
  const image = raw ? raw.split('?')[0] : null;
  return {
    ...film,
    synopsis: extract,
    // Wikipedia has one lead image; there is no separate backdrop, and
    // stretching a portrait poster into one would look like a mistake.
    posterUrl: image ?? placeholder(film.title, '400x600', '111827'),
    backdropUrl: null,
    source: image ? 'wikipedia' : 'placeholder',
  };
}

async function resolveFilm(film: FilmSource): Promise<CatalogueEntry> {
  if (TMDB_KEY) {
    try {
      const hit = await fromTmdb(film);
      if (hit) return hit;
      console.warn(`  TMDB had no match for ${film.title}; falling back`);
    } catch (err) {
      console.warn(`  TMDB failed for ${film.title}: ${(err as Error).message}`);
    }
  }

  try {
    const hit = await fromWikipedia(film);
    if (hit) return hit;
  } catch (err) {
    console.warn(`  Wikipedia failed for ${film.title}: ${(err as Error).message}`);
  }

  // Never fail the build over artwork. A placeholder keeps the catalogue
  // complete and says plainly, in the cache, that it is one.
  return {
    ...film,
    synopsis: `${film.title} is screening now.`,
    posterUrl: placeholder(film.title, '400x600', '111827'),
    backdropUrl: placeholder(film.title, '1280x720', '111827'),
    source: 'placeholder',
  };
}

async function main() {
  if (TMDB_KEY) {
    const kind = TMDB_KEY.split('.').length === 3 ? 'v4 read access token' : 'v3 API key';
    console.log(`Source: TMDB (${kind})`);
  } else {
    console.log('Source: Wikipedia (no TMDB_API_KEY)');
    console.log('');
    console.log('  Wikipedia serves fair-use poster files, which are deliberately small —');
    console.log('  often under 300px wide. On a 3x phone screen that is upscaled roughly');
    console.log('  three times and looks it. Set TMDB_API_KEY in apps/api/.env for');
    console.log(`  ${POSTER_SIZE} artwork off a CDN built to serve it. A key is free:`);
    console.log('  https://www.themoviedb.org/settings/api');
  }
  console.log('');

  const nowShowing: CatalogueEntry[] = [];
  const comingSoon: CatalogueEntry[] = [];

  for (const [list, target] of [
    [NOW_SHOWING, nowShowing],
    [COMING_SOON, comingSoon],
  ] as const) {
    for (const film of list) {
      const entry = await resolveFilm(film);
      target.push(entry);
      console.log(`  ${entry.source.padEnd(11)} ${entry.title}`);
    }
  }

  const payload = { fetchedAt: new Date().toISOString(), nowShowing, comingSoon };
  await writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`);

  const counts = [...nowShowing, ...comingSoon].reduce<Record<string, number>>((acc, e) => {
    acc[e.source] = (acc[e.source] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`\nWrote ${nowShowing.length + comingSoon.length} films to catalogue.json`, counts);
}

void main();
