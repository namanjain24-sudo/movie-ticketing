/**
 * Resolves a real image for every event and venue, and caches the result to
 * `prisma/event-images.json`.
 *
 * The same bargain `fetch-catalogue.ts` makes for films, and for the same
 * reason. The first version of the event seed had poster URLs written out by
 * hand from memory — `.../400px-Arijit_Singh_2019.jpg` and so on — and four
 * of the five were 400s. A guessed URL is not a shortcut to real data, it is
 * a broken image that looks like real data in the diff.
 *
 * So: ask Wikipedia for the lead image of the article that genuinely is the
 * subject, by title, and write down what it answers. A subject with no usable
 * image gets a placeholder that says so rather than a dead link.
 *
 *   npm run fetch:event-images --workspace @app/api
 *
 * Cached rather than fetched at seed time, so `db:seed` stays reproducible
 * and works with no network at all.
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT = resolve(import.meta.dirname, '../../prisma/event-images.json');

/**
 * Wikipedia article titles, keyed by the slug they belong to.
 *
 * Each one is the article about that actual subject — the team, the person,
 * the ground. Nothing here is a search guess: if an article does not exist
 * for something, it is left out and gets a placeholder.
 */
const ARTICLES: Record<string, string> = {
  // Events
  'mumbai-indians-vs-chennai-super-kings': 'Mumbai_Indians',
  'royal-challengers-bengaluru-vs-kolkata-knight-riders': 'Royal_Challengers_Bengaluru',
  'india-vs-australia-test-match': 'India_national_cricket_team',
  'chennai-super-kings-vs-rajasthan-royals': 'Chennai_Super_Kings',
  'arijit-singh-live': 'Arijit_Singh',
  'divine-gully-gang-live': 'Divine_(rapper)',
  'zakir-khan-live': 'Zakir_Khan_(comedian)',
  'kanan-gill-new-hour': 'Kanan_Gill',
  // The play has no lead image; its author does, and a portrait of Girish
  // Karnad is a defensible picture for a Girish Karnad play.
  'tughlaq-prithvi': 'Girish_Karnad',
  'system-design-interview-workshop': 'Whiteboard',
  'hindustani-classical-workshop': 'Hindustani_classical_music',

  // Venues, for the backdrop on an event that plays there.
  'wankhede-stadium-mumbai': 'Wankhede_Stadium',
  'm-chinnaswamy-stadium-bengaluru': 'M._Chinnaswamy_Stadium',
  'eden-gardens-kolkata': 'Eden_Gardens',
  'ma-chidambaram-stadium-chennai': 'M._A._Chidambaram_Stadium',
  'dy-patil-stadium-navi-mumbai': 'DY_Patil_Stadium',
  'jawaharlal-nehru-stadium-delhi': 'Jawaharlal_Nehru_Stadium_(Delhi)',
  'prithvi-theatre-mumbai': 'Prithvi_Theatre',
};

export interface EventImage {
  /**
   * Lead image, already stripped of Wikipedia's analytics parameters. Empty
   * when the article has none, which the app renders as initials.
   */
  imageUrl: string;
  /** Which article it came from, so a wrong picture is traceable. */
  article: string;
  source: 'wikipedia' | 'placeholder';
}

/**
 * No image rather than a third-party one.
 *
 * This used to point at placehold.co, which does not resolve from every
 * network — including this one — so the "safe" fallback was the only entry in
 * the catalogue that actually failed to load. The app's `Poster` already
 * draws initials on a tinted card when it has no URL, which is self-contained,
 * always works, and does not quietly add a dependency on somebody else's
 * uptime to a seed script.
 */
const NO_IMAGE = '';

async function leadImage(article: string): Promise<string | null> {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${article}`, {
      headers: { accept: 'application/json', 'user-agent': 'ticketing-demo/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      type?: string;
      originalimage?: { source?: string };
      thumbnail?: { source?: string };
    };

    // A disambiguation page answers 200 with an image that is not of the
    // subject. It has to be rejected here or it lands looking plausible.
    if (data.type === 'disambiguation') return null;

    const raw = data.originalimage?.source ?? data.thumbnail?.source ?? null;
    return raw ? (raw.split('?')[0] ?? null) : null;
  } catch {
    return null;
  }
}

async function main() {
  const out: Record<string, EventImage> = {};
  let found = 0;

  for (const [slug, article] of Object.entries(ARTICLES)) {
    const url = await leadImage(article);
    if (url) {
      found += 1;
      out[slug] = { imageUrl: url, article, source: 'wikipedia' };
      console.log(`  ok          ${slug}`);
    } else {
      out[slug] = { imageUrl: NO_IMAGE, article, source: 'placeholder' };
      console.log(`  placeholder ${slug}  (no usable image on ${article})`);
    }
  }

  await writeFile(OUT, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`\n${found}/${Object.keys(ARTICLES).length} resolved from Wikipedia → ${OUT}`);
}

void main();
