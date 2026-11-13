import { SHOW_FORMAT_LABELS } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, Pressable, Share, View } from 'react-native';
import Animated, {
  Extrapolation,
  FadeInDown,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { catalogApi } from '../../../api/catalog';
import { EmptyState, ErrorState } from '../../../components/query-state';
import { Badge, Card, RatingStars, Skeleton, Text } from '../../../components/ui';
import { DateStrip } from '../../../features/catalog/date-strip';
import {
  cheapestAt,
  cheapestInList,
  cheapestIsWorthMarking,
  orderCinemas,
  type ShowtimeOrder,
} from '../../../features/catalog/ordering';
import { ShowtimeOrderPicker } from '../../../features/catalog/showtime-order';
import { ambiguousShowtimeIds } from '../../../features/catalog/ambiguous-times';
import { ShowtimeChip } from '../../../features/catalog/showtime-chip';
import { SimilarMoviesRail } from '../../../features/catalog/similar-movies-rail';
import { useRecentlyViewed } from '../../../features/catalog/use-recently-viewed';
import {
  ShowtimeFilters,
  applyFilter,
  filterOptions,
  type ShowtimeFilter,
} from '../../../features/catalog/showtime-filters';
import { AVAILABILITY_LABELS, availabilityColor } from '../../../features/catalog/availability';
import {
  cancelReleaseCheck,
  isReleaseCheckScheduled,
  requestNotificationPermissionIfUnasked,
  scheduleReleaseCheck,
} from '../../../features/notifications/notifications';
import { formatMonthDay, formatRuntime, upcomingDays } from '../../../lib/format';
import { successFeedback, tapFeedback } from '../../../lib/haptics';
import { formatDistance, openDirections } from '../../../lib/maps';
import { queryKeys } from '../../../lib/query-client';
import { shareLink } from '../../../lib/share-link';
import { useWatchlist } from '../../../features/watchlist/use-watchlist';
import { useTheme } from '../../../theme';
import { HIT_SIZE } from '../../../theme/tokens';
import { markClosed, nextCloseAfter } from '../../../features/catalog/closing';
import { useLastKnownLocation } from '../../../features/cinemas/use-location';
import { useTickAt } from '../../../lib/use-tick-at';

/** How far ahead the date strip runs. The API windows a week by default. */
const DAYS_AHEAD = 7;
const { width: SCREEN, height: WINDOW } = Dimensions.get('window');

/**
 * The artwork gets the top of the screen, the same as it does on home.
 *
 * It used to get 196 points of itself blurred to an eighteen-point radius -
 * a smear with a back button in it - and then the sharp poster appeared
 * underneath at 104 points wide. Two copies of one image, neither of them
 * big, and a third of the first screen spent before the title.
 *
 * The fraction is what decides how far down the poster the crop reaches, and
 * a poster carries its own title about seven tenths of the way down. Past
 * that the film is named twice, in two typefaces, one of them ours - and no
 * scrim fixes it, because ninety per cent black over bright type is still
 * bright type. Same number as the home hero, for the same reason.
 */
const HERO_HEIGHT = Math.min(Math.round(WINDOW * 0.55), Math.round(SCREEN * 1.5));

export default function MovieDetail() {
  const { idOrSlug } = useLocalSearchParams<{ idOrSlug: string }>();
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();
  const watchlist = useWatchlist();
  const { record: recordViewed } = useRecentlyViewed();
  const insets = useSafeAreaInsets();

  const days = useMemo(() => upcomingDays(DAYS_AHEAD), []);
  const [date, setDate] = useState(days[0].value);
  const [filter, setFilter] = useState<ShowtimeFilter>({});
  const [order, setOrder] = useState<ShowtimeOrder>('nearest');
  const [synopsisOpen, setSynopsisOpen] = useState(false);
  const [notifyRequested, setNotifyRequested] = useState(false);

  const movie = useQuery({
    queryKey: queryKeys.movie(idOrSlug),
    queryFn: () => catalogApi.movie(idOrSlug),
    enabled: Boolean(idOrSlug),
  });

  // Declared after the query so it can read which backdrop is being shown.
  // Both are unconditional hooks and both run before the pending branch
  // below, so the order is the same on every render.
  const backdropHeight = HERO_HEIGHT;

  // The backdrop's one authored moment: it stretches on the overscroll bounce
  // and drifts slower than the page as you scroll past it, the way a header
  // image reads as depth rather than a static banner.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const backdropStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [-backdropHeight, 0, backdropHeight],
          [0, 0, backdropHeight * 0.35],
          Extrapolation.CLAMP,
        ),
      },
      {
        scale: interpolate(scrollY.value, [-backdropHeight, 0], [2, 1], Extrapolation.CLAMP),
      },
    ],
  }));

  // The scheduled-notification list is the only record of this toggle's
  // state — there is no backend field for it (see `scheduleReleaseCheck`'s
  // own comment on why not) — so it has to be read back on load rather than
  // assumed off.
  useEffect(() => {
    const id = movie.data?.id;
    if (!id || movie.data?.isNowShowing) return;
    void isReleaseCheckScheduled(id).then(setNotifyRequested);
  }, [movie.data?.id, movie.data?.isNowShowing]);

  useEffect(() => {
    if (movie.data) recordViewed(movie.data);
  }, [movie.data, recordViewed]);

  // Showtimes key off the movie's id, not the slug in the URL, so the cache
  // holds one entry per movie however the screen was reached.
  /**
   * Whatever position the person already granted on the Cinemas tab, if any.
   *
   * Read, never asked for: this screen is about a film, and a location prompt
   * here would arrive without the question it answers being visible. When
   * there is nothing to read the list comes back alphabetically, exactly as
   * it always did.
   */
  const here = useLastKnownLocation();
  const showtimeQuery = {
    movieId: movie.data?.id,
    date,
    ...(here ? { lat: here.lat, lng: here.lng } : {}),
  };
  const showtimes = useQuery({
    queryKey: queryKeys.showtimes(showtimeQuery),
    queryFn: () => catalogApi.showtimes(showtimeQuery),
    enabled: Boolean(movie.data?.id),
  });

  /**
   * The day's list with the screenings that have stopped selling marked.
   *
   * The API returns a whole day, so a list fetched in the evening still holds
   * the matinees. Both of these used to be decided once, from the clock as it
   * read when the list landed — and then the screen sits there. Twenty minutes
   * on this page is an ordinary thing to do, and for nineteen of them a six
   * o'clock show went on looking bookable, in the colour that means bookable,
   * with a price under it. Tapping it was the first anyone heard otherwise.
   *
   * Refetching would fix it and cost far too much: a day's chips across a city
   * is around 200KB, and nothing in it has gone out of date except the clock.
   * So the clock wakes instead, exactly when the next chip's answer changes.
   */
  const nextClose = useCallback(
    (at: number) => (showtimes.data ? nextCloseAfter(showtimes.data, at) : null),
    [showtimes.data],
  );
  const now = useTickAt(nextClose);
  const marked = useMemo(
    () => (showtimes.data ? markClosed(showtimes.data, now) : undefined),
    [showtimes.data, now],
  );

  if (movie.isPending) return <MovieDetailSkeleton />;

  if (movie.isError || !movie.data) {
    return (
      <ErrorState
        error={movie.error}
        title="Could not load this film"
        onRetry={() => void movie.refetch()}
      />
    );
  }

  const film = movie.data;
  const filtered = marked ? applyFilter(marked, filter) : [];
  const visible = orderCinemas(filtered, order);
  /**
   * The cheapest seat anywhere in what is on screen, not in the whole day.
   *
   * Taken after filtering, so the badge marks the cheapest of what somebody
   * is actually being shown. A badge pointing at a price the current filters
   * have hidden is a badge pointing at nothing.
   */
  const lowestMinor = cheapestInList(visible);
  // Only when it tells somebody something: if every venue opens at the
  // same price, a badge on each one is a badge on none.
  const markCheapest = cheapestIsWorthMarking(visible);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Animated.ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <View
          style={{
            height: backdropHeight,
            backgroundColor: colors.chrome,
            // The artwork stops on its own edge rather than dissolving into
            // the page, for the reason the home hero does: the last stretch
            // of a fade to the background is lit, and a poster's credit
            // block sits exactly there.
            borderBottomLeftRadius: radius.xl,
            borderBottomRightRadius: radius.xl,
            overflow: 'hidden',
          }}
        >
          {/*
            Not every source ships a landscape still. When only the poster
            exists, it becomes an out-of-focus wash rather than a second, sharp
            copy of the image already sitting on top of it — the poster stays
            the one thing in focus, which is how a film page should read.

            The animated wrapper (not the image itself, which expo-image does
            not expose an Animated variant of) is what stretches on overscroll
            and drifts on scroll.
          */}
          <Animated.View style={[{ position: 'absolute', inset: 0 }, backdropStyle]}>
            <Image
              source={film.backdropUrl ?? film.posterUrl}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              // Sharp. A poster blurred to eighteen points is a smear, and
              // the scrim below already gives the title its ground - the
              // blur was only ever hiding that the image was too small to
              // fill the space. Anchored to the top, because posters put
              // faces there and a centre crop takes the chin off each one.
              contentPosition="top"
              transition={220}
              accessible={false}
            />
          </Animated.View>
          {/* Darkened at the top for the back button, then melted into the page
              at the bottom. A hard edge where the wash stops and the page
              begins read as a cropped photo; a fade reads as one surface. */}
          <LinearGradient
            // Dark at the very top so the back button and the status bar
            // have something to sit on, clear through the faces, then down
            // hard: a poster carries its own title near the bottom, and
            // without this the film is named twice - once in the artwork's
            // type and once in ours directly underneath it.
            colors={['rgba(0,0,0,0.55)', 'transparent', 'rgba(11,11,16,0.9)']}
            locations={[0, 0.3, 0.92]}
            style={{ position: 'absolute', inset: 0 }}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            hitSlop={8}
            style={{
              position: 'absolute',
              top: insets.top + spacing.sm,
              left: spacing.lg,
              width: HIT_SIZE,
              height: HIT_SIZE,
              borderRadius: radius.full,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0,0,0,0.45)',
            }}
          >
            <Ionicons name="arrow-back" size={22} color={colors.onImage} />
          </Pressable>
        </View>

        {/* The poster straddles the backdrop, which is what makes this read as
            a film page rather than an article with a picture on top. */}
        {/* No second copy of the poster.
        
            There used to be one here, 104 points wide, overlapping the
            blurred version of itself above - and the title column beside it
            waited 76 points before starting, so the dark half of the backdrop
            would not eat it. That left a block of empty page beside the
            poster's top on every film in the catalogue. The artwork is the
            hero now, so the title simply follows it - below the hero's edge,
            not tucked under it: the artwork used to fade out there and the
            overlap was invisible, and now that it ends on a hard edge the
            title was sitting half on the picture and half off it. */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
          <View style={{ gap: spacing.xs }}>
            <Text variant="display" numberOfLines={3}>
              {film.title}
            </Text>
            <Text variant="caption" tone="muted">
              {film.certification} · {formatRuntime(film.durationMins)}
            </Text>

            {/* The rating is a link, not an ornament: the number raises the
                question and the reviews are the only thing that answers it. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                film.rating.average === null
                  ? 'No reviews yet. Be the first to rate this film'
                  : `Rated ${film.rating.average} out of 5 from ${film.rating.count} reviews. Read them`
              }
              hitSlop={6}
              onPress={() => router.push(`/movie/${idOrSlug}/reviews`)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
            >
              {film.rating.average !== null ? (
                <>
                  <RatingStars value={film.rating.average} size={13} />
                  <Text variant="label" numeric>
                    {film.rating.average.toFixed(1)}
                  </Text>
                  <Text variant="caption" tone="muted" numeric>
                    ({film.rating.count})
                  </Text>
                </>
              ) : (
                <Text variant="label" tone="primary">
                  Be the first to rate
                </Text>
              )}
              <Ionicons name="chevron-forward" size={13} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>

        <View style={{ padding: spacing.lg, gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {film.formats.map((format) => (
              <Badge key={format} label={SHOW_FORMAT_LABELS[format]} tone="primary" />
            ))}
            {film.languages.map((language) => (
              <Badge key={language} label={language} variant="outline" />
            ))}
          </View>

          {/* Real synopses run several sentences. Clamped by default so the
              showtimes — the reason anyone opened this screen — stay reachable
              without a long scroll. */}
          <View style={{ gap: spacing.xs }}>
            <Text tone="muted" numberOfLines={synopsisOpen ? undefined : 3}>
              {film.synopsis}
            </Text>
            {film.synopsis.length > 180 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: synopsisOpen }}
                hitSlop={6}
                onPress={() => setSynopsisOpen((open) => !open)}
              >
                <Text variant="label" tone="primary">
                  {synopsisOpen ? 'Show less' : 'Read more'}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <Text variant="caption" tone="muted">
            {film.genres.join(' · ')}
          </Text>

          {/* The three things people reach for on a film page that are not
              booking: keep it, tell someone, read or add a verdict. */}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <ActionButton
              icon={watchlist.isSaved(film.id) ? 'heart' : 'heart-outline'}
              label={watchlist.isSaved(film.id) ? 'Saved' : 'Save'}
              onPress={() => watchlist.toggle(film)}
            />
            <ActionButton
              icon="share-outline"
              label="Share"
              onPress={() =>
                void Share.share({
                  title: film.title,
                  message: `${film.title} (${film.certification}) — ${formatRuntime(
                    film.durationMins,
                  )}${
                    film.rating.average !== null
                      ? `, rated ${film.rating.average.toFixed(1)}/5`
                      : ''
                  }. Book it in the app: ${shareLink(`/movie/${film.slug}`)}`,
                })
              }
            />
            {/* One control, not two. "Reviews" and "Rate" both pushed the
                same route — the reviews screen carries the composer — so the
                row offered the same destination twice and spent a quarter of
                itself doing it. What changes is which job is worth naming: with
                reviews to read, the count is the invitation; with none, the
                only reason to go is to write the first one. */}
            <ActionButton
              icon={film.rating.count > 0 ? 'chatbubble-ellipses-outline' : 'star-outline'}
              label={film.rating.count > 0 ? `Reviews (${film.rating.count})` : 'Rate it'}
              onPress={() => router.push(`/movie/${idOrSlug}/reviews`)}
            />
            {film.isNowShowing ? null : (
              <ActionButton
                icon={notifyRequested ? 'notifications' : 'notifications-outline'}
                label={notifyRequested ? 'Notified' : 'Notify me'}
                onPress={() => {
                  // Not optimistic: `attempt()` inside the notifications
                  // module swallows failures, so the only honest way to know
                  // whether this actually took is to ask the OS again after,
                  // rather than assume the toggle succeeded.
                  if (notifyRequested) {
                    tapFeedback();
                    void cancelReleaseCheck(film.id).then(() =>
                      isReleaseCheckScheduled(film.id).then(setNotifyRequested),
                    );
                  } else {
                    successFeedback();
                    void requestNotificationPermissionIfUnasked()
                      .then(() => scheduleReleaseCheck(film))
                      .then(() => isReleaseCheckScheduled(film.id))
                      .then(setNotifyRequested);
                  }
                }}
              />
            )}
          </View>
        </View>

        <View style={{ height: 8, backgroundColor: colors.surfaceSunken }} />

        {film.isNowShowing ? (
          <View style={{ paddingVertical: spacing.lg, gap: spacing.lg }}>
            {/* The plan entry belongs here rather than in the action row
                above: this is the moment somebody is deciding *which*
                showing, which is the decision a watch party exists to make
                with other people. The row above is already three controls and
                says so. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: spacing.sm,
                paddingHorizontal: spacing.lg,
              }}
            >
              <Text variant="heading">Choose a showtime</Text>
              <Pressable
                onPress={() => router.push(`/plan/new?movie=${film.slug}`)}
                accessibilityRole="button"
                accessibilityLabel="Plan this film with friends"
                hitSlop={8}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
              >
                <Ionicons name="people" size={15} color={colors.primary} />
                <Text variant="label" style={{ color: colors.primary }}>
                  Plan with friends
                </Text>
              </Pressable>
            </View>

            <DateStrip
              days={days}
              value={date}
              onChange={(next) => {
                setDate(next);
                // Another day offers other formats; a stale filter would read as
                // "no screenings" when there are plenty.
                setFilter({});
              }}
            />

            {showtimes.data ? (
              <ShowtimeFilters
                {...filterOptions(showtimes.data)}
                value={filter}
                onChange={setFilter}
              />
            ) : null}

            {/* Only once there is more than one venue to arrange. Offering a
                sort over a single cinema is a control that cannot do
                anything. */}
            {visible.length > 1 ? (
              <ShowtimeOrderPicker
                value={order}
                onChange={setOrder}
                cheapestMinor={lowestMinor}
                currency={visible[0]?.showtimes[0]?.currency ?? 'INR'}
              />
            ) : null}

            <View style={{ paddingHorizontal: spacing.lg }}>
              <Legend />
            </View>

            <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
              {showtimes.isPending ? (
                <>
                  <Skeleton style={{ height: 128, borderRadius: radius.lg }} />
                  <Skeleton style={{ height: 128, borderRadius: radius.lg }} />
                </>
              ) : showtimes.isError ? (
                <ErrorState
                  error={showtimes.error}
                  title="Could not load showtimes"
                  onRetry={() => void showtimes.refetch()}
                />
              ) : visible.length === 0 ? (
                <EmptyState
                  title={
                    showtimes.data.length === 0
                      ? 'No screenings that day'
                      : 'Nothing matches those filters'
                  }
                  message={
                    showtimes.data.length === 0
                      ? 'Try another date from the strip above.'
                      : 'Clear a filter to see the rest of the day.'
                  }
                  action={
                    showtimes.data.length > 0
                      ? { label: 'Clear filters', onPress: () => setFilter({}) }
                      : undefined
                  }
                />
              ) : (
                visible.map(({ cinema, showtimes: slots }, index) => {
                  // Per cinema, not per page: two cinemas showing the same
                  // film at 4:45 are told apart by the cinema's own name
                  // above them, and only a clash inside one list is
                  // ambiguous.
                  const ambiguousHere = ambiguousShowtimeIds(slots);
                  return (
                    <Animated.View
                      key={cinema.id}
                      entering={FadeInDown.delay(Math.min(index, 6) * 40).duration(260)}
                    >
                      <Card style={{ gap: spacing.md }}>
                        {/* The venue block is a link now that a venue is a place:
                      it has a map, a phone number and the rest of its week. */}
                        <View
                          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
                        >
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`${cinema.name}, ${
                              cinema.distanceKm === null
                                ? ''
                                : `${formatDistance(cinema.distanceKm)} away, `
                            }${cinema.address}. Open this cinema`}
                            onPress={() => router.push(`/cinema/${cinema.slug}`)}
                            hitSlop={4}
                            style={{ flex: 1, gap: spacing['2xs'] }}
                          >
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: spacing.xs,
                              }}
                            >
                              <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
                                {cinema.name}
                              </Text>
                              <Ionicons name="chevron-forward" size={13} color={colors.textMuted} />
                              {/* Marked rather than only sorted, so the cheapest
                                venue is findable while reading the list by
                                distance - which is how most people read it.
                                Only with something to be cheaper than. */}
                              {markCheapest &&
                              lowestMinor !== null &&
                              cheapestAt({ cinema, showtimes: slots }) === lowestMinor ? (
                                <Badge label="Cheapest" tone="success" />
                              ) : null}
                            </View>
                            <Text variant="caption" tone="muted" numberOfLines={1}>
                              {cinema.distanceKm === null
                                ? cinema.address
                                : `${formatDistance(cinema.distanceKm)} · ${cinema.address}`}
                            </Text>
                          </Pressable>

                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Directions to ${cinema.name}`}
                            onPress={() =>
                              void openDirections({
                                latitude: cinema.latitude,
                                longitude: cinema.longitude,
                                label: cinema.name,
                              })
                            }
                            hitSlop={8}
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: radius.full,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: colors.surfaceMuted,
                            }}
                          >
                            <Ionicons name="navigate-outline" size={16} color={colors.accent} />
                          </Pressable>
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                          {slots.map((slot) => (
                            <ShowtimeChip
                              key={slot.id}
                              showtime={slot}
                              closed={slot.closed}
                              ambiguous={ambiguousHere.has(slot.id)}
                              onPress={() => router.push(`/showtime/${slot.id}`)}
                            />
                          ))}
                        </View>
                      </Card>
                    </Animated.View>
                  );
                })
              )}
            </View>
          </View>
        ) : (
          <ComingSoonPanel releaseDate={film.releaseDate} />
        )}

        <View style={{ height: 8, backgroundColor: colors.surfaceSunken }} />

        <SimilarMoviesRail film={film} onSelect={(movie) => router.push(`/movie/${movie.slug}`)} />
      </Animated.ScrollView>
    </View>
  );
}

/** Shaped like the page itself: backdrop, poster, title, synopsis, actions —
 * so the layout is already in place the instant the film data lands instead
 * of jumping into existence under a spinner. */
function MovieDetailSkeleton() {
  const { spacing, radius } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Skeleton style={{ height: HERO_HEIGHT, borderRadius: 0 }} />

      <View
        style={{
          flexDirection: 'row',
          gap: spacing.lg,
          paddingHorizontal: spacing.lg,
          marginTop: -72,
        }}
      >
        <Skeleton style={{ width: 104, aspectRatio: 2 / 3, borderRadius: radius.lg }} />
        <View style={{ flex: 1, paddingTop: 76, gap: spacing.sm }}>
          <Skeleton style={{ height: 22, width: '85%', borderRadius: 6 }} />
          <Skeleton style={{ height: 14, width: '50%', borderRadius: 6 }} />
        </View>
      </View>

      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          <Skeleton style={{ height: 22, width: 64, borderRadius: radius.full }} />
          <Skeleton style={{ height: 22, width: 64, borderRadius: radius.full }} />
        </View>
        <Skeleton style={{ height: 14, width: '100%', borderRadius: 6 }} />
        <Skeleton style={{ height: 14, width: '100%', borderRadius: 6 }} />
        <Skeleton style={{ height: 14, width: '70%', borderRadius: 6 }} />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Skeleton style={{ flex: 1, height: HIT_SIZE, borderRadius: radius.md }} />
          <Skeleton style={{ flex: 1, height: HIT_SIZE, borderRadius: radius.md }} />
          <Skeleton style={{ flex: 1, height: HIT_SIZE, borderRadius: radius.md }} />
          <Skeleton style={{ flex: 1, height: HIT_SIZE, borderRadius: radius.md }} />
        </View>
      </View>
    </View>
  );
}

/**
 * Stands in for the showtime section on a film that has none yet — there is
 * never anything for `DateStrip`/`ShowtimeFilters` to show a coming-soon
 * film, so this replaces the whole block rather than rendering it empty.
 */
function ComingSoonPanel({ releaseDate }: { releaseDate: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ padding: spacing.lg, alignItems: 'center', gap: spacing.xs }}>
      <Ionicons name="calendar-outline" size={28} color={colors.textMuted} />
      <Text variant="heading" align="center">
        Not yet on sale
      </Text>
      <Text tone="muted" align="center">
        Releases {formatMonthDay(releaseDate)}. Tap Notify me above and this app will nudge you to
        check back.
      </Text>
    </View>
  );
}

/** Names the colour scale once, so every chip below reads without guessing. */
function Legend() {
  const { colors, spacing } = useTheme();
  const bands = ['PLENTY', 'FILLING', 'ALMOST_FULL'] as const;

  return (
    <View style={{ flexDirection: 'row', gap: spacing.lg }}>
      {bands.map((band) => (
        <View key={band} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: availabilityColor(band, colors),
            }}
          />
          <Text variant="caption" tone="muted">
            {AVAILABILITY_LABELS[band]}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * A secondary action on the film page: an icon over a word, sized to a thumb.
 *
 * Deliberately not `Button`. These three sit in a row under the synopsis and
 * must read as a set of equals, none of which is the thing the screen wants
 * you to do — that is the showtime grid further down, and a row of full-width
 * buttons above it would compete with it.
 */
function ActionButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: HIT_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
      })}
    >
      <Ionicons name={icon} size={18} color={colors.text} />
      <Text variant="caption" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
