import type { RatingSummary, Review, ReviewList, ReviewSort } from '@app/shared';
import { RATING_MAX, RATING_MIN } from '@app/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { HttpError } from '../../http/errors';

type ReviewRow = {
  id: string;
  rating: number;
  body: string | null;
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  user: { name: string };
};

function toReview(row: ReviewRow, callerId?: string): Review {
  return {
    id: row.id,
    rating: row.rating,
    body: row.body,
    authorName: row.user.name,
    verified: row.verified,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    mine: Boolean(callerId) && row.userId === callerId,
  };
}

const ORDER: Record<ReviewSort, Prisma.ReviewOrderByWithRelationInput[]> = {
  recent: [{ createdAt: 'desc' }],
  // Verified first, then newest. "Helpful" on a film means "they saw it".
  helpful: [{ verified: 'desc' }, { createdAt: 'desc' }],
  highest: [{ rating: 'desc' }, { createdAt: 'desc' }],
  lowest: [{ rating: 'asc' }, { createdAt: 'desc' }],
};

/** Resolves a slug or an id to a movie id, or 404s. */
async function movieIdFor(idOrSlug: string): Promise<string> {
  const movie = await prisma.movie.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: { id: true },
  });
  if (!movie) throw HttpError.notFound('That movie is not showing');
  return movie.id;
}

/**
 * Average and count for a set of movies, in one query.
 *
 * The average is rounded to one decimal at the edge rather than in the client:
 * two clients rounding 4.25 differently is the kind of difference someone
 * eventually files a bug about.
 */
export async function ratingsFor(movieIds: string[]): Promise<Map<string, RatingSummary>> {
  if (movieIds.length === 0) return new Map();

  const rows = await prisma.review.groupBy({
    by: ['movieId'],
    where: { movieId: { in: movieIds } },
    _avg: { rating: true },
    _count: { _all: true },
  });

  const out = new Map<string, RatingSummary>();
  for (const id of movieIds) out.set(id, { average: null, count: 0 });
  for (const row of rows) {
    const average = row._avg.rating;
    out.set(row.movieId, {
      average: average === null ? null : Math.round(average * 10) / 10,
      count: row._count._all,
    });
  }
  return out;
}

/** How many reviews gave each star count, always all five rows, zeros included. */
export async function breakdownFor(movieId: string): Promise<{ rating: number; count: number }[]> {
  const rows = await prisma.review.groupBy({
    by: ['rating'],
    where: { movieId },
    _count: { _all: true },
  });
  const counts = new Map(rows.map((r) => [r.rating, r._count._all]));

  // Descending, because that is the order the bars are drawn in, and every
  // star is present so the chart does not change shape as votes arrive.
  const out: { rating: number; count: number }[] = [];
  for (let rating = RATING_MAX; rating >= RATING_MIN; rating--) {
    out.push({ rating, count: counts.get(rating) ?? 0 });
  }
  return out;
}

export async function listReviews(params: {
  idOrSlug: string;
  sort: ReviewSort;
  rating?: number;
  userId?: string;
}): Promise<ReviewList> {
  const movieId = await movieIdFor(params.idOrSlug);

  const select = {
    id: true,
    rating: true,
    body: true,
    verified: true,
    createdAt: true,
    updatedAt: true,
    userId: true,
    user: { select: { name: true } },
  } as const;

  const [rows, summary, breakdown, mineRow] = await Promise.all([
    prisma.review.findMany({
      where: { movieId, ...(params.rating ? { rating: params.rating } : {}) },
      orderBy: ORDER[params.sort],
      take: 100,
      select,
    }),
    ratingsFor([movieId]),
    breakdownFor(movieId),
    // Fetched separately rather than found in `rows`: a star filter can
    // exclude the caller's own review, and the screen still has to be able to
    // show them what they wrote.
    params.userId
      ? prisma.review.findUnique({
          where: { userId_movieId: { userId: params.userId, movieId } },
          select,
        })
      : null,
  ]);

  const aggregate = summary.get(movieId) ?? { average: null, count: 0 };

  return {
    reviews: rows.map((r) => toReview(r, params.userId)),
    mine: mineRow ? toReview(mineRow, params.userId) : null,
    average: aggregate.average,
    count: aggregate.count,
    breakdown,
    canReview: Boolean(params.userId),
  };
}

/**
 * Create or replace the caller's review of a film.
 *
 * One person has one review per film, so this is an upsert rather than a
 * create: posting twice edits, it does not stack. The uniqueness is a database
 * constraint, and this is the path that respects it rather than the path that
 * enforces it.
 */
export async function upsertReview(params: {
  idOrSlug: string;
  userId: string;
  rating: number;
  body?: string | null;
}): Promise<Review> {
  const movieId = await movieIdFor(params.idOrSlug);

  // "Verified" means they actually bought a ticket for this film. Checked at
  // write time and stored, so the badge cannot be lost later by a cancellation
  // — they still saw it — and the list does not pay for this join per row.
  const booking = await prisma.booking.findFirst({
    where: {
      userId: params.userId,
      status: 'CONFIRMED',
      showtime: { movieId },
    },
    select: { id: true },
  });

  const row = await prisma.review.upsert({
    where: { userId_movieId: { userId: params.userId, movieId } },
    create: {
      movieId,
      userId: params.userId,
      rating: params.rating,
      body: params.body ?? null,
      verified: booking !== null,
    },
    update: {
      rating: params.rating,
      body: params.body ?? null,
      // A booking made since the first draft should count.
      ...(booking ? { verified: true } : {}),
    },
    select: {
      id: true,
      rating: true,
      body: true,
      verified: true,
      createdAt: true,
      updatedAt: true,
      userId: true,
      user: { select: { name: true } },
    },
  });

  return toReview(row, params.userId);
}

export async function deleteReview(params: { idOrSlug: string; userId: string }): Promise<void> {
  const movieId = await movieIdFor(params.idOrSlug);
  const deleted = await prisma.review.deleteMany({
    where: { movieId, userId: params.userId },
  });
  if (deleted.count === 0) throw HttpError.notFound('You have not reviewed this film');
}
