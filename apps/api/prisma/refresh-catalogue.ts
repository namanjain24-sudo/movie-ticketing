import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AccessibilityFeature, PrismaClient } from '@prisma/client';
import { ADS_MINUTES, accessibilityViaFor } from './seed';

/**
 * Brings catalogue columns that arrived after a database was first seeded up
 * to date, without touching anything a person owns.
 *
 * `seed-if-empty.ts` already carries this problem one level up: it seeds only
 * an empty catalogue, which left an existing deployment with the events
 * tables present and permanently unfillable. The same thing happens a level
 * down and is quieter. A migration adds a column with a default, every row
 * that already exists takes the default, and the feature built on that column
 * is invisible in production for ever - the code is deployed, the payload has
 * the field, and the field is always empty.
 *
 * Three of those shipped in one week: the advertising minutes a ticket needs
 * to say when the film actually starts, the accessibility a screening has to
 * disclose before anybody books, and the photographs on the concession menu.
 * All three worked locally, where the database is reseeded, and none of them
 * had ever appeared on the deployed app.
 *
 * Everything here is narrow and asks before it writes. The question is always
 * "has this ever been applied", never "is this row missing it", so a second
 * boot costs one count and stops - the same shape as the events check, and
 * the reason this is safe to run on every start.
 *
 * It only ever fills catalogue columns in. It does not delete, it does not
 * touch bookings, holds, payments or users, and it does not overwrite a value
 * somebody deliberately set.
 */
export interface CatalogueRefresh {
  adsMinutes: number;
  accessibility: number;
  concessionImages: number;
}

interface ConcessionImage {
  imageUrl: string;
  creator: string;
  licence: string;
  sourcePage: string;
}

const CONCESSION_IMAGES: Record<string, ConcessionImage> = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'concession-images.json'), 'utf8'),
) as Record<string, ConcessionImage>;

/**
 * Which already-seeded screenings get which accessibility features.
 *
 * The seed decides this from the day, the slot and the screen, which is a
 * nicer spread and is not available here: a row that already exists knows
 * none of those things. So this works from the showtime's own id, which gives
 * the same two properties that actually matter — a minority of screenings,
 * and the same answer every time this runs — over a different set of rows
 * than a fresh seed would have picked. For a demo catalogue that difference
 * is not worth a second source of truth.
 */
function featuresFor(id: string): AccessibilityFeature[] {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const n = (hash >>> 0) % 24;
  const features: AccessibilityFeature[] = [];
  if (n % 6 === 0) features.push('CLOSED_CAPTIONS');
  if (n % 12 === 0) features.push('AUDIO_DESCRIPTION');
  if (n === 0) features.push('INDIAN_SIGN_LANGUAGE');
  return features;
}

export async function refreshCatalogue(prisma: PrismaClient): Promise<CatalogueRefresh> {
  const done: CatalogueRefresh = { adsMinutes: 0, accessibility: 0, concessionImages: 0 };

  // --- Advertising before the film -----------------------------------------
  // Films only. A match runs no trailers, so zero is the right answer for an
  // event and must not be mistaken for a row nobody has filled in.
  if ((await prisma.showtime.count({ where: { adsMinutes: { gt: 0 } } })) === 0) {
    const { count } = await prisma.showtime.updateMany({
      where: { adsMinutes: 0, movieId: { not: null } },
      data: { adsMinutes: ADS_MINUTES },
    });
    done.adsMinutes = count;
  }

  // --- What a screening offers, and how it is received ---------------------
  if ((await prisma.showtime.count({ where: { accessibility: { isEmpty: false } } })) === 0) {
    const rows = await prisma.showtime.findMany({
      where: { movieId: { not: null } },
      select: { id: true },
    });

    // Grouped, so this is a handful of statements rather than one per
    // screening: a seeded catalogue has thousands.
    const byCombination = new Map<string, string[]>();
    for (const row of rows) {
      const features = featuresFor(row.id);
      if (features.length === 0) continue;
      const key = features.join(',');
      byCombination.set(key, [...(byCombination.get(key) ?? []), row.id]);
    }

    for (const [key, ids] of byCombination) {
      const features = key.split(',') as AccessibilityFeature[];
      const { count } = await prisma.showtime.updateMany({
        where: { id: { in: ids } },
        data: { accessibility: features, accessibilityVia: accessibilityViaFor(features) },
      });
      done.accessibility += count;
    }
  }

  // --- Photographs on the concession menu ----------------------------------
  if ((await prisma.concessionItem.count({ where: { imageUrl: { not: null } } })) === 0) {
    for (const [name, art] of Object.entries(CONCESSION_IMAGES)) {
      // Both or neither, the same rule the rest of this feature follows: a
      // CC BY photograph shown without naming its author is a licence breach.
      if (!art.imageUrl || !art.creator || !art.licence) continue;
      const { count } = await prisma.concessionItem.updateMany({
        where: { name, imageUrl: null },
        data: {
          imageUrl: art.imageUrl,
          imageCredit: `${art.creator}, ${art.licence}`,
          imageCreditUrl: art.sourcePage || null,
        },
      });
      done.concessionImages += count;
    }
  }

  return done;
}
