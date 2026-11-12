/**
 * A typographic mark for a cinema chain.
 *
 * The cinemas tab is the one screen in the app with no artwork at all: 18
 * cards of grey text, read as a wall. The honest way to give it colour is not
 * a stock photograph of somebody else's foyer standing in for this venue —
 * it is the chain's own name, set as a mark. That claims nothing that is not
 * true and nothing the catalogue does not already know.
 */

/** The tint families a mark may use, each a background and ink already paired. */
export const BRAND_TINTS = ['primary', 'accent', 'success', 'warning'] as const;
export type BrandTint = (typeof BRAND_TINTS)[number];

/**
 * What to set in the tile.
 *
 * An acronym is kept whole, because that is the name: PVR is not "Pv", and a
 * person scanning the list is looking for the word they know. Anything else
 * gets its first letter, which keeps every other tile the same shape and
 * avoids inventing an abbreviation nobody uses — "Cinépolis" is C, not "Ci".
 *
 * Accents are kept. The letter is the brand's, not ASCII's.
 */
export function brandInitials(brand: string): string {
  const name = brand.trim();
  if (name.length === 0) return '—';

  const words = name.split(/\s+/);
  const first = words[0] ?? '';
  // An acronym: one short word in capitals, which the chains here mostly are.
  if (words.length === 1 && first.length <= 4 && first === first.toUpperCase()) {
    return first;
  }
  return (first[0] ?? '—').toUpperCase();
}

/**
 * Which tint a chain gets, stably.
 *
 * Hashed from the name rather than listed, so a cinema added to the catalogue
 * tomorrow has a mark without anybody editing a table — and so the same chain
 * is the same colour on every screen and every run. The colour means nothing
 * beyond "this is that chain", which is the whole job.
 */
export function brandTint(brand: string): BrandTint {
  let hash = 2166136261;
  const name = brand.trim().toLowerCase();
  for (let i = 0; i < name.length; i += 1) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  // Mixed before it is divided. FNV's low bits are its weakest, and taking
  // them modulo four put four of this catalogue's seven chains on the same
  // colour and left two colours unused - including, on the screen, two
  // cards in a row wearing the same tint as if they were related.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909);
  hash ^= hash >>> 16;

  return BRAND_TINTS[(hash >>> 0) % BRAND_TINTS.length] as BrandTint;
}
