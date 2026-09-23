import type { MovieSummary } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, TextInput, View } from 'react-native';
import { catalogApi } from '../../api/catalog';
import { EmptyState, ErrorState } from '../../components/query-state';
import { AppBar, Skeleton } from '../../components/ui';
import { CitySheet } from '../../features/catalog/city-sheet';
import { FeaturedRail } from '../../features/catalog/featured-rail';
import {
  GenreFilter,
  byGenre,
  byLanguage,
  genresIn,
  languagesIn,
} from '../../features/catalog/genre-filter';
import { MovieCard } from '../../features/catalog/movie-card';
import { SectionHeader } from '../../features/catalog/section-header';
import { promosApi } from '../../api/promos';
import { OffersRail } from '../../features/promos/offers-rail';
import { RecentSearchChips } from '../../features/search/recent-search-chips';
import { useRecentSearches } from '../../features/search/use-recent-searches';
import { queryKeys } from '../../lib/query-client';
import { STORAGE_KEYS } from '../../lib/storage';
import { useTheme } from '../../theme';
import { HIT_SIZE } from '../../theme/tokens';

const COLUMNS = 2;
/** How many films head the carousel before the grid takes over. */
const FEATURED_COUNT = 3;

export default function NowShowing() {
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();

  const [city, setCity] = useState<string | undefined>(undefined);
  const [cityOpen, setCityOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [genre, setGenre] = useState<string | undefined>(undefined);
  const [language, setLanguage] = useState<string | undefined>(undefined);
  const recentSearches = useRecentSearches(STORAGE_KEYS.recentFilmSearches);

  // Cities are effectively static, so they outlive the default stale time and
  // never flash the picker while a movie list refetches.
  const cities = useQuery({
    queryKey: queryKeys.cities,
    queryFn: catalogApi.cities,
    staleTime: 60 * 60_000,
  });

  const trimmed = search.trim();
  const query = useMemo(() => ({ city, ...(trimmed ? { search: trimmed } : {}) }), [city, trimmed]);

  const movies = useQuery({
    queryKey: queryKeys.movies(query),
    queryFn: () => catalogApi.movies(query),
  });

  // Offers change by the day at most, and the strip is decoration until checkout.
  const offers = useQuery({
    queryKey: queryKeys.promoOffers,
    queryFn: promosApi.offers,
    staleTime: 5 * 60_000,
  });

  // Release dates move slowly, so this outlives the default stale time.
  const comingSoon = useQuery({
    queryKey: queryKeys.comingSoon,
    queryFn: catalogApi.comingSoon,
    staleTime: 30 * 60_000,
  });

  const open = (movie: MovieSummary) => router.push(`/movie/${movie.slug}`);

  // Genre is a client-side narrowing of what the server already sent, so it
  // costs nothing and never empties the screen while a request is in flight.
  const all = movies.data ?? [];
  const genres = genresIn(all);
  const languages = languagesIn(all);
  const shown = byLanguage(byGenre(all, genre), language);
  const narrowed = Boolean(genre || language);

  // The carousel is a shortcut into the same catalogue, so it only earns its
  // space when there is more below it than it is already showing.
  const searching = trimmed.length > 0;
  const featured =
    !searching && !narrowed && shown.length > FEATURED_COUNT ? shown.slice(0, FEATURED_COUNT) : [];

  const header = (
    <View style={{ gap: spacing.xl, paddingBottom: spacing.lg }}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            minHeight: HIT_SIZE,
          }}
        >
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onSubmitEditing={() => recentSearches.record(search)}
            placeholder="Search for a film"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search films"
            style={{ flex: 1, color: colors.text, fontSize: 15, paddingVertical: spacing.sm }}
          />
          {search ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
              onPress={() => setSearch('')}
            >
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {searchFocused && !search ? (
        <RecentSearchChips
          recent={recentSearches.recent}
          onSelect={(query) => {
            setSearch(query);
            recentSearches.record(query);
          }}
          onClear={recentSearches.clear}
        />
      ) : null}

      {featured.length > 0 ? <FeaturedRail movies={featured} onSelect={open} /> : null}

      {!searching && !narrowed && offers.data && offers.data.length > 0 ? (
        <OffersRail offers={offers.data} />
      ) : null}

      {all.length > 0 ? (
        <SectionHeader
          title={searching ? 'Results' : (genre ?? 'Now showing')}
          note={
            narrowed
              ? `${shown.length} film${shown.length === 1 ? '' : 's'}`
              : city
                ? `In ${city}`
                : 'Across all cities'
          }
        />
      ) : null}

      {!searching && genres.length > 1 ? (
        <GenreFilter genres={genres} value={genre} onChange={setGenre} />
      ) : null}

      {!searching && languages.length > 1 ? (
        <GenreFilter
          genres={languages}
          value={language}
          onChange={setLanguage}
          allLabel="All languages"
        />
      ) : null}
    </View>
  );

  // Sits below the grid, never mixed into it: these cannot be booked yet, and
  // a poster that does nothing when tapped is worse than one further down.
  const footer =
    searching || narrowed || !comingSoon.data?.length ? null : (
      <View style={{ gap: spacing.lg, paddingTop: spacing['2xl'] }}>
        <SectionHeader title="Coming soon" note="Not on sale yet" />
        <FlatList
          data={comingSoon.data}
          horizontal
          keyExtractor={(movie) => movie.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.lg, paddingHorizontal: spacing.lg }}
          renderItem={({ item }) => (
            <MovieCard movie={item} width={130} releaseNote onPress={() => open(item)} />
          )}
        />
      </View>
    );

  if (movies.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <AppBar
          title={city ?? 'All cities'}
          subtitle="Location"
          onPressTitle={() => setCityOpen(true)}
        />
        <ErrorState
          error={movies.error}
          title="Could not load films"
          onRetry={() => void movies.refetch()}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppBar
        title={city ?? 'All cities'}
        subtitle="Location"
        onPressTitle={() => setCityOpen(true)}
      />

      {movies.isPending ? (
        <HomeSkeleton />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(movie) => movie.id}
          renderItem={({ item }) => <MovieCard movie={item} onPress={() => open(item)} />}
          numColumns={COLUMNS}
          columnWrapperStyle={{ gap: spacing.lg, paddingHorizontal: spacing.lg }}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          contentContainerStyle={{ paddingBottom: spacing['2xl'], gap: spacing.xl }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={movies.isRefetching}
              onRefresh={() => void movies.refetch()}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={
                searching
                  ? `No films match “${trimmed}”`
                  : narrowed
                    ? `Nothing matches ${[genre, language].filter(Boolean).join(' · ')} right now`
                    : 'Nothing showing here'
              }
              message={
                searching
                  ? 'Try a shorter search, or check the spelling.'
                  : city
                    ? `No films are screening in ${city} right now.`
                    : 'No films are screening right now. Check back soon.'
              }
              action={
                searching
                  ? { label: 'Clear search', onPress: () => setSearch('') }
                  : city
                    ? { label: 'Show all cities', onPress: () => setCity(undefined) }
                    : undefined
              }
            />
          }
        />
      )}

      <CitySheet
        visible={cityOpen}
        cities={cities.data ?? []}
        value={city}
        onChange={setCity}
        onClose={() => setCityOpen(false)}
      />
    </View>
  );
}

/** Shaped like the screen it stands in for: a banner, then a grid of posters. */
function HomeSkeleton() {
  const { spacing } = useTheme();
  return (
    <View style={{ padding: spacing.lg, gap: spacing.xl }}>
      <Skeleton style={{ height: HIT_SIZE, borderRadius: 10 }} />
      <Skeleton style={{ height: 210, borderRadius: 20 }} />
      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <Skeleton style={{ flex: 1, aspectRatio: 2 / 3, borderRadius: 14 }} />
        <Skeleton style={{ flex: 1, aspectRatio: 2 / 3, borderRadius: 14 }} />
      </View>
    </View>
  );
}
