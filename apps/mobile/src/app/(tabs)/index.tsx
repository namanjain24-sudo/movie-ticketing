import type { MovieSummary } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
import { AppBar, PageTexture, Skeleton } from '../../components/ui';
import { EventCard } from '../../features/events/event-card';
import { CitySheet } from '../../features/catalog/city-sheet';
import { FeaturedRail } from '../../features/catalog/featured-rail';
import { HomeHero } from '../../features/catalog/home-hero';
import {
  GenreFilter,
  byGenre,
  byLanguage,
  genresIn,
  languagesIn,
} from '../../features/catalog/genre-filter';
import { MovieCard } from '../../features/catalog/movie-card';
import { SectionHeader } from '../../features/catalog/section-header';
import { StartingSoonRail } from '../../features/catalog/starting-soon-rail';
import {
  nextStartingSoonChangeAfter,
  startingSoon,
  type SoonShow,
} from '../../features/catalog/starting-soon';
import { useRecentlyViewed } from '../../features/catalog/use-recently-viewed';
import { promosApi } from '../../api/promos';
import { OffersRail } from '../../features/promos/offers-rail';
import { RecentSearchChips } from '../../features/search/recent-search-chips';
import { SponsorSlot } from '../../features/sponsors/sponsor-slot';
import { useRecentSearches } from '../../features/search/use-recent-searches';
import { queryKeys } from '../../lib/query-client';
import { STORAGE_KEYS } from '../../lib/storage';
import { useLastKnownLocation } from '../../features/cinemas/use-location';
import { toDateKey } from '../../lib/format';
import { useDebouncedValue } from '../../lib/use-debounced-value';
import { useTickAt } from '../../lib/use-tick-at';
import { useTheme } from '../../theme';
import { HIT_SIZE } from '../../theme/tokens';

/**
 * Three, not two, because of what the catalogue's artwork actually is.
 *
 * Every poster is a Wikipedia fair-use file 260 to 283 pixels wide. At two
 * columns a card is about 172pt, which a 3x phone renders at 518px: the app
 * was asking a 260px file to fill twice its own width, on the screen people
 * spend the most time on. Measured across four common sizes, two columns is a
 * 1.4x to 2.2x upscale and three is 0.89x to 1.41x - at the low end the file
 * is being downsampled rather than stretched.
 *
 * So the grid is denser and the posters are sharp, which is the trade worth
 * making while the artwork is what it is. With 780px files this could go back
 * to two.
 */
const COLUMNS = 3;
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

  /**
   * What is still catchable tonight.
   *
   * Scoped to the chosen city and to today, which is both what the question
   * means and what keeps the request small: a day in one city is about 14KB,
   * where the same call unscoped is 330KB of other people's evenings.
   *
   * Only with a city. Without one the API answers for every city it has, and
   * a rail promising a show you could get to would be offering one in a
   * different state.
   *
   * The position is read, never asked for. `useLastKnownLocation` holds what
   * the Cinemas tab was granted, and a rail on the home screen has not earned
   * a permission prompt - so when there is no position the server sends no
   * distances and the selector drops its travel filter rather than inventing
   * a journey.
   */
  const coords = useLastKnownLocation();
  const soonQuery = useMemo(
    () => ({
      city,
      date: toDateKey(new Date()),
      ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
    }),
    [city, coords],
  );
  const soonShowtimes = useQuery({
    queryKey: queryKeys.showtimes(soonQuery),
    queryFn: () => catalogApi.showtimes(soonQuery),
    enabled: Boolean(city) && !searching && !narrowed,
    staleTime: 2 * 60_000,
  });

  // Memoised for its identity, not for its cost. `?? []` builds a new array
  // every render, which would change `nextSoonChange` every render, which
  // would have `useTickAt` tear down and rebuild its timer every render -
  // the one thing that hook exists to avoid.
  const soonCinemas = useMemo(() => soonShowtimes.data ?? [], [soonShowtimes.data]);
  // The response is right and only the clock moves, so the rail re-derives
  // itself on a timer that wakes when a row joins or leaves it, and never in
  // between. Refetching to learn the time would cost 14KB to find out what
  // `Date.now()` already knows.
  const nextSoonChange = useCallback(
    (now: number) => nextStartingSoonChangeAfter(soonCinemas, now),
    [soonCinemas],
  );
  const soonNow = useTickAt(nextSoonChange);
  const soon = useMemo(() => startingSoon(soonCinemas, soonNow), [soonCinemas, soonNow]);

  const openShow = (show: SoonShow) => router.push(`/showtime/${show.showtime.id}`);

  const header = (
    <View style={{ gap: spacing.xl, paddingBottom: spacing.lg }}>
      {/* The artwork first, at the top of the screen, before anything else.
          It used to come fourth: a greeting, a headline the height of two
          lines of display type, a pair of chips and a search field all ran
          ahead of it, and on a 411-point phone a third of the screen was
          spent before a film appeared at all. */}
      {!searching && featured.length > 0 ? (
        <FeaturedRail movies={featured} onSelect={open} />
      ) : null}

      {/* Only when browsing. Mid-search this is a line saying how many films
          exist directly above the three that matched, which is the screen
          arguing with itself. */}
      {!searching ? (
        <HomeHero
          city={city}
          count={movies.isPending ? undefined : all.length}
          onPressCity={() => setCityOpen(true)}
          onDiscover={() => router.push('/discover')}
        />
      ) : null}

      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingTop: searching ? spacing.lg : 0,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            // A filled pill rather than an outlined box. The old field was a
            // 10pt-cornered rectangle with a hairline, which is the house
            // style of a 2015 form; this is the shape every app a sixteen
            // year old opens uses for search, and it stops competing with the
            // cards below it for the same border colour.
            backgroundColor: colors.surfaceMuted,
            borderRadius: radius.full,
            paddingHorizontal: spacing.lg,
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

      {!searching && !narrowed ? <StartingSoonRail shows={soon} onSelect={openShow} /> : null}

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

  const footer = searching ? (
    eventResults
  ) : narrowed ? null : (
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
      <PageTexture />
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

/**
 * Shaped like the screen it stands in for, which is the only thing a skeleton
 * is for: the hero's two lines of large type, the pill, the rail, then the
 * grid at the column count the grid actually uses.
 *
 * It had drifted on all three counts. Two poster placeholders against a
 * three-column grid, a 10pt-cornered rectangle where the search field is now
 * a pill, and radii written as the literals 10, 14 and 20 - which were the
 * old scale, so every corner here disagreed with the component it was
 * standing in for. Taken from `radius` now, so the next change carries.
 */
function HomeSkeleton() {
  const { spacing, radius } = useTheme();
  return (
    <View style={{ padding: spacing.lg, gap: spacing.xl }}>
      <View style={{ gap: spacing.md }}>
        <Skeleton style={{ height: 11, width: 120, borderRadius: radius.sm }} />
        <Skeleton style={{ height: 40, width: '85%', borderRadius: radius.md }} />
        <Skeleton style={{ height: 40, width: '60%', borderRadius: radius.md }} />
        <Skeleton style={{ height: 34, width: 180, borderRadius: radius.full }} />
      </View>
      <Skeleton style={{ height: HIT_SIZE, borderRadius: radius.full }} />
      <Skeleton style={{ height: 210, borderRadius: radius.xl }} />
      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        {Array.from({ length: COLUMNS }, (_, column) => (
          <Skeleton key={column} style={{ flex: 1, aspectRatio: 2 / 3, borderRadius: radius.xl }} />
        ))}
      </View>
    </View>
  );
}
