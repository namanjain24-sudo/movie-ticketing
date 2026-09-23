import type { MovieSummary } from '@app/shared';
import { prisma } from '../../db';
import { HttpError } from '../../http/errors';
import { ratingsFor } from '../reviews/reviews.service';

/** Resolves a slug or an id to a movie id, or 404s. */
async function movieIdFor(idOrSlug: string): Promise<string> {
  const movie = await prisma.movie.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: { id: true },
  });
  if (!movie) throw HttpError.notFound('That movie does not exist');
  return movie.id;
}

/** Most recently saved first, which is the order a person remembers them in. */
export async function listWatchlist(userId: string): Promise<MovieSummary[]> {
  const items = await prisma.watchlistItem.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      movie: {
        select: {
          id: true,
          slug: true,
          title: true,
          posterUrl: true,
          durationMins: true,
          certification: true,
          languages: true,
          genres: true,
          releaseDate: true,
          isNowShowing: true,
        },
      },
    },
  });

  const ratings = await ratingsFor(items.map((i) => i.movie.id));

  return items.map(({ movie }) => ({
    ...movie,
    releaseDate: movie.releaseDate.toISOString(),
    rating: ratings.get(movie.id) ?? { average: null, count: 0 },
  }));
}

/**
 * Idempotent by the composite primary key: `skipDuplicates` turns a second save
 * into a no-op inside the database rather than a check-then-insert that two
 * quick taps could race.
 */
export async function saveMovie(userId: string, idOrSlug: string): Promise<void> {
  const movieId = await movieIdFor(idOrSlug);
  await prisma.watchlistItem.createMany({ data: [{ userId, movieId }], skipDuplicates: true });
}

/** Removing something that was never saved is not an error: the end state is the same. */
export async function removeMovie(userId: string, idOrSlug: string): Promise<void> {
  const movieId = await movieIdFor(idOrSlug);
  await prisma.watchlistItem.deleteMany({ where: { userId, movieId } });
}
