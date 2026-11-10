/**
 * Resolves a freely licensed photograph for every concession item and caches
 * the result to `prisma/concession-images.json`.
 *
 * Named files, not a search, for the reason `fetch-event-images.ts` gives
 * about articles — and this script learned it the hard way. The first version
 * searched Commons and accepted any result whose title said "popcorn", which
 * is how a photograph of a Doc Popcorn shop front and one of a drinks fridge
 * in a Hong Kong mall ended up on a cinema menu. Both titles were accurate.
 * Neither was a picture of the thing being sold.
 *
 * So each file below was found by searching, then opened and looked at, and
 * only then written down. What is left for this script to do is the part a
 * person should not do by hand: resolve the scaled URL, the author and the
 * licence from Commons, so the credit is whatever Commons actually says
 * rather than whatever was true the day somebody copied it.
 *
 *   npm run fetch:concession-images --workspace @app/api
 *
 * Cached rather than fetched at seed time, so `db:seed` stays reproducible
 * and works with no network at all.
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT = resolve(import.meta.dirname, '../../prisma/concession-images.json');

const API = 'https://commons.wikimedia.org/w/api.php';

/**
 * Commons file names, keyed by the menu item they are a picture of.
 *
 * Every one has been looked at. They are ordinary photographs of ordinary
 * food rather than studio shots, which is the right register here: the menu
 * is five things sold in a foyer, not a campaign.
 */
const FILES: Record<string, string> = {
  'Classic popcorn (large)': 'Bowl of Popcorn (Unsplash).jpg',
  'Popcorn & drink combo': 'Lahaina, Maui, Hawaii (June 2019) - popcorn and drink.jpg',
  'Nachos with cheese dip': 'Nachos-cheese.jpg',
  'Soft drink (regular)': 'Coca-Cola Glas mit Eis.jpg',
  'Packaged drinking water': 'Kirkland Signature Drinking Water 1.5L 20050508.jpg',
};

/**
 * Licences this may ship under.
 *
 * `nc` is out because a ticketing app sells things, and `nd` because a
 * thumbnail is a derivative. Checked rather than assumed: a file's licence
 * can change after somebody picks it, and the failure would be silent.
 */
const ALLOWED = [/^cc0/i, /^public domain/i, /^cc by(-sa)? \d/i];
const REFUSED = [/\bnc\b/i, /\bnd\b/i, /noncommercial/i, /noderiv/i];

export interface ConcessionImage {
  imageUrl: string;
  /** Named because CC BY and CC BY-SA require it. */
  creator: string;
  /** "CC BY-SA 4.0", as Commons states it. */
  licence: string;
  licenceUrl: string;
  /** The file's page, so a wrong picture is traceable. */
  sourcePage: string;
  source: 'commons' | 'placeholder';
}

interface CommonsPage {
  title?: string;
  missing?: string;
  imageinfo?: {
    url?: string;
    /** The scaled copy, requested through `iiurlwidth`. */
    thumburl?: string;
    descriptionurl?: string;
    mime?: string;
    extmetadata?: Record<string, { value?: string }>;
  }[];
}

/** Commons stores the author as HTML, usually a link. Only the name is wanted. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The author's name, without MediaWiki's furniture around it.
 *
 * Commons stores whatever the uploader typed, so the same person arrives as
 * "Summi", "Summi from German Wikipedia" and "Original uploader was Jm51 at
 * en.wikipedia". A credit line has to name them, not recite where the file
 * was moved from, and five of those phrases turn one caption into a
 * paragraph. The name itself is never touched: only the wrapper is.
 */
function tidyCreator(raw: string): string {
  const name = raw
    .replace(/^original uploader was\s+/i, '')
    .replace(/\s+at\s+\w+\.wikipedia.*$/i, '')
    .replace(/\s+from\s+(the\s+)?\w+\s+wikipedia.*$/i, '')
    .trim();
  return name || raw.trim();
}

function usableLicence(name: string): boolean {
  if (!name) return false;
  if (REFUSED.some((pattern) => pattern.test(name))) return false;
  return ALLOWED.some((pattern) => pattern.test(name));
}

/** No image rather than a third-party placeholder, exactly as the events do. */
const NONE: ConcessionImage = {
  imageUrl: '',
  creator: '',
  licence: '',
  licenceUrl: '',
  sourcePage: '',
  source: 'placeholder',
};

async function describe(files: string[]): Promise<Map<string, ConcessionImage>> {
  const out = new Map<string, ConcessionImage>();
  const titles = files.map((f) => `File:${f}`).join('|');
  const url =
    `${API}?action=query&format=json&titles=${encodeURIComponent(titles)}` +
    `&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=640`;

  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'ticketing-demo/1.0' },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`Commons answered ${res.status}`);

  const data = (await res.json()) as { query?: { pages?: Record<string, CommonsPage> } };
  for (const page of Object.values(data.query?.pages ?? {})) {
    const name = (page.title ?? '').replace(/^File:/, '');
    if (page.missing !== undefined) continue;

    const info = page.imageinfo?.[0];
    if (!info?.url) continue;
    if (info.mime !== 'image/jpeg' && info.mime !== 'image/png') continue;

    const meta = info.extmetadata ?? {};
    const licence = plainText(meta.LicenseShortName?.value ?? '');
    if (!usableLicence(licence)) continue;

    out.set(name, {
      // The scaled copy, never the original: two of these are multi-megabyte
      // photographs at full size, which is not a thumbnail on a menu row, it
      // is somebody's data allowance.
      imageUrl: (info.thumburl ?? info.url).split('?')[0] ?? info.url,
      creator: tidyCreator(plainText(meta.Artist?.value ?? '')) || 'Unknown',
      licence,
      licenceUrl: plainText(meta.LicenseUrl?.value ?? ''),
      sourcePage: info.descriptionurl ?? '',
      source: 'commons',
    });
  }
  return out;
}

async function main() {
  const described = await describe(Object.values(FILES));
  const out: Record<string, ConcessionImage> = {};
  let found = 0;

  for (const [item, file] of Object.entries(FILES)) {
    const art = described.get(file);
    if (art) {
      found += 1;
      out[item] = art;
      console.log(`  ok          ${item}  (${art.licence}, ${art.creator})`);
    } else {
      out[item] = NONE;
      console.log(`  placeholder ${item}  (${file} is gone, or its licence no longer allows this)`);
    }
  }

  await writeFile(OUT, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`\n${found}/${Object.keys(FILES).length} with a photograph → ${OUT}`);
}

void main();
