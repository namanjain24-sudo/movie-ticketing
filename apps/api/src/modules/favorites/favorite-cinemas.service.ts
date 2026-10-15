import type { CinemaDirectoryEntry } from '@app/shared';
import { prisma } from '../../db';
import { HttpError } from '../../http/errors';
import { listCinemas } from '../catalog/catalog.service';

/** Resolves a slug or an id to a cinema id, or 404s — same shape as
 * watchlist.service.ts's `movieIdFor`. */
async function cinemaIdFor(idOrSlug: string): Promise<string> {
  const cinema = await prisma.cinema.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: { id: true },
  });
  if (!cinema) throw HttpError.notFound('That cinema does not exist');
  return cinema.id;
}

/**
 * Most recently pinned first. Built on `listCinemas` rather than a second copy
 * of its now-showing/cheapest-price joins, then reordered to the save order —
 * `listCinemas` itself sorts by distance or name, neither of which is what a
 * "my cinemas" list should read as.
 */
export async function listFavoriteCinemas(userId: string): Promise<CinemaDirectoryEntry[]> {
  const favorites = await prisma.cinemaFavorite.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { cinemaId: true },
  });
  if (favorites.length === 0) return [];

  const ids = favorites.map((f) => f.cinemaId);
  const entries = await listCinemas({ ids });
  const position = new Map(ids.map((id, index) => [id, index]));
  return entries.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
}

/** Idempotent by the composite primary key, same as `watchlist.service.ts`'s `saveMovie`. */
export async function saveCinema(userId: string, idOrSlug: string): Promise<void> {
  const cinemaId = await cinemaIdFor(idOrSlug);
  await prisma.cinemaFavorite.createMany({ data: [{ userId, cinemaId }], skipDuplicates: true });
}

export async function removeCinema(userId: string, idOrSlug: string): Promise<void> {
  const cinemaId = await cinemaIdFor(idOrSlug);
  await prisma.cinemaFavorite.deleteMany({ where: { userId, cinemaId } });
}
