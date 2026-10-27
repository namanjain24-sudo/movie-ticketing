import type { MovieSummary } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { catalogApi } from '../../api/catalog';
import { eventsApi } from '../../api/events';
import { EmptyState, ErrorState } from '../../components/query-state';
import { AppBar, Skeleton } from '../../components/ui';
import { EventCard } from '../../features/events/event-card';
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
import { useRecentlyViewed } from '../../features/catalog/use-recently-viewed';
import { promosApi } from '../../api/promos';
import { OffersRail } from '../../features/promos/offers-rail';
import { RecentSearchChips } from '../../features/search/recent-search-chips';
import { SponsorSlot } from '../../features/sponsors/sponsor-slot';
import { useRecentSearches } from '../../features/search/use-recent-searches';
import { queryKeys } from '../../lib/query-client';
import { STORAGE_KEYS } from '../../lib/storage';
import { useDebouncedValue } from '../../lib/use-debounced-value';
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
  const recentlyViewed = useRecentlyViewed();

  // Cities are effectively static, so they outlive the default stale time and
  // never flash the picker while a movie list refetches.
  const cities = useQuery({
    queryKey: queryKeys.cities,
    queryFn: catalogApi.cities,
    staleTime: 60 * 60_000,
  });

  const trimmed = search.trim();
  // Debounced before it reaches the query key: `movies.isPending` goes true
  // for any queryKey react-query hasn't cached yet, and the screen swaps to
  // HomeSkeleton while pending — which would unmount the still-focused search
  // input, and with it whatever the user was about to type next, on every
  // single keystroke without this.
  const debouncedSearch = useDebouncedValue(trimmed, 300);
  const query = useMemo(
    () => ({ city, ...(debouncedSearch ? { search: debouncedSearch } : {}) }),
    [city, debouncedSearch],
  );

  const movies = useQuery({
    queryKey: queryKeys.movies(query),
    queryFn: () => catalogApi.movies(query),
  });

  /**
   * The app sells matches, gigs, comedy, workshops and plays, and the search
   * on its front screen knew about none of them: typing a comedian's name
   * found nothing while his show was on sale two tabs away.
   *
   * Only while there is something to search for. Browsing the home screen
   * should not pay for a query nobody asked.
   */
  const eventMatches = useQuery({
    queryKey: queryKeys.events({ q: debouncedSearch, city }),
    queryFn: () => eventsApi.list({ q: debouncedSearch, city }),
    enabled: debouncedSearch.length > 0,
  });
  const foundEvents = debouncedSearch ? (eventMatches.data?.events ?? []) : [];

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
  // The grid's own arithmetic: a gutter each side, one gap between the two
  // columns, the rest split evenly. Kept here rather than inside MovieCard
  // because it is a fact about this grid, not about a poster.
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = (windowWidth - spacing.lg * (COLUMNS + 1)) / COLUMNS;

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
            placeholder="Search films and events"
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

      {!searching && !narrowed && recentlyViewed.movies.length > 0 ? (
        <View style={{ gap: spacing.md }}>
          <SectionHeader title="Recently viewed" />
          <FlatList
            data={recentlyViewed.movies}
            horizontal
            keyExtractor={(movie) => movie.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.lg, paddingHorizontal: spacing.lg }}
            renderItem={({ item }) => (
              <MovieCard movie={item} width={130} onPress={() => open(item)} />
            )}
          />
        </View>
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
  //
  // The house ad goes under all of it, which is where an ad belongs in a
  // screen somebody opened to find a film: after the films. It is skipped
  // while searching or filtering, when the person is plainly looking for
  // something specific and an ad is noise in the way of it.
  const eventResults =
    foundEvents.length > 0 ? (
      <View style={{ gap: spacing.md, paddingTop: spacing.xl }}>
        <SectionHeader title={`Events matching “${trimmed}”`} />
        <View style={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}>
          {foundEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onPress={() => router.push(`/event/${event.slug}`)}
            />
          ))}
        </View>
      </View>
    ) : null;

  const footer =
    searching ? eventResults : narrowed ? null : (
      <View style={{ gap: spacing.lg, paddingTop: spacing['2xl'] }}>
        {comingSoon.data?.length ? (
          <>
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
          </>
        ) : null}

        <SponsorSlot />
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
          renderItem={({ item, index }) => (
            <Animated.View
              entering={FadeInDown.delay(Math.min(Math.floor(index / COLUMNS), 6) * 50).duration(
                280,
              )}
            >
              {/*
                An explicit width, not `flex: 1`. A FlatList row holding one
                child stretches it across the whole row, so a catalogue with an
                odd number of films rendered its last poster at double size —
                one enormous card sitting under a tidy grid. The width is the
                same arithmetic the grid already does with its padding and gap,
                so a full row is unchanged and a lone last card keeps its place.
              */}
              <MovieCard movie={item} width={cardWidth} onPress={() => open(item)} />
            </Animated.View>
          )}
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
                // When events matched, the films coming up empty is a partial
                // answer, not a dead end — and the screen already shows what
                // it did find, below.
                searching && foundEvents.length > 0
                  ? `No films match “${trimmed}”, but this did`
                  : searching
                    ? `No films match “${trimmed}”`
                  : narrowed
                    ? `Nothing matches ${[genre, language].filter(Boolean).join(' · ')} right now`
                    : 'Nothing showing here'
              }
              message={
                // Telling somebody to check their spelling when the app found
                // exactly what they typed is the screen arguing with itself.
                searching && foundEvents.length > 0
                  ? undefined
                  : searching
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
