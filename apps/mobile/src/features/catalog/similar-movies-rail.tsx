import type { MovieDetail, MovieSummary } from '@app/shared';
import { useQuery } from '@tanstack/react-query';
import { FlatList, View } from 'react-native';
import { catalogApi } from '../../api/catalog';
import { queryKeys } from '../../lib/query-client';
import { useTheme } from '../../theme';
import { MovieCard } from './movie-card';
import { SectionHeader } from './section-header';

const RAIL_CARD_WIDTH = 130;
const LIMIT = 10;

/** Same film shares a genre with itself, so the current one is excluded first. */
export function relatedTo(film: MovieDetail, all: MovieSummary[]): MovieSummary[] {
  const genres = new Set(film.genres);
  return all
    .filter((m) => m.id !== film.id && m.genres.some((g) => genres.has(g)))
    .sort((a, b) => {
      const overlap = (m: MovieSummary) => m.genres.filter((g) => genres.has(g)).length;
      return overlap(b) - overlap(a);
    })
    .slice(0, LIMIT);
}

/**
 * Sits at the foot of the film page, after everything the page itself is
 * for — booking a showtime, reading the verdict — because it exists to hand
 * the visit off to another film rather than to compete with those.
 */
export function SimilarMoviesRail({
  film,
  onSelect,
}: {
  film: MovieDetail;
  onSelect: (movie: MovieSummary) => void;
}) {
  const { spacing } = useTheme();

  // The same "everything on sale" query the home tab's unfiltered grid uses,
  // so a visit that started there already has this warm in cache.
  const movies = useQuery({
    queryKey: queryKeys.movies({}),
    queryFn: () => catalogApi.movies({}),
  });

  const related = movies.data ? relatedTo(film, movies.data) : [];
  if (related.length === 0) return null;

  return (
    <View style={{ paddingVertical: spacing.lg, gap: spacing.md }}>
      <SectionHeader title="You might also like" />
      <FlatList
        data={related}
        horizontal
        keyExtractor={(movie) => movie.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.lg, paddingHorizontal: spacing.lg }}
        renderItem={({ item }) => (
          <MovieCard movie={item} width={RAIL_CARD_WIDTH} onPress={() => onSelect(item)} />
        )}
      />
    </View>
  );
}
