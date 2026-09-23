import { SHOW_FORMAT_LABELS } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { catalogApi } from '../../../api/catalog';
import { EmptyState, ErrorState, LoadingState } from '../../../components/query-state';
import { Badge, Card, Poster, RatingStars, Skeleton, Text } from '../../../components/ui';
import { DateStrip } from '../../../features/catalog/date-strip';
import { ShowtimeChip } from '../../../features/catalog/showtime-chip';
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
import { openDirections } from '../../../lib/maps';
import { queryKeys } from '../../../lib/query-client';
import { useWatchlist } from '../../../features/watchlist/use-watchlist';
import { useTheme } from '../../../theme';
import { HIT_SIZE } from '../../../theme/tokens';

/** How far ahead the date strip runs. The API windows a week by default. */
const DAYS_AHEAD = 7;
const BACKDROP_HEIGHT = 260;

export default function MovieDetail() {
  const { idOrSlug } = useLocalSearchParams<{ idOrSlug: string }>();
  const router = useRouter();
  const { colors, radius, spacing, elevation } = useTheme();
  const watchlist = useWatchlist();
  const insets = useSafeAreaInsets();

  const days = useMemo(() => upcomingDays(DAYS_AHEAD), []);
  const [date, setDate] = useState(days[0].value);
  const [filter, setFilter] = useState<ShowtimeFilter>({});
  const [synopsisOpen, setSynopsisOpen] = useState(false);
  const [notifyRequested, setNotifyRequested] = useState(false);

  const movie = useQuery({
    queryKey: queryKeys.movie(idOrSlug),
    queryFn: () => catalogApi.movie(idOrSlug),
    enabled: Boolean(idOrSlug),
  });

  // The scheduled-notification list is the only record of this toggle's
  // state — there is no backend field for it (see `scheduleReleaseCheck`'s
  // own comment on why not) — so it has to be read back on load rather than
  // assumed off.
  useEffect(() => {
    const id = movie.data?.id;
    if (!id || movie.data?.isNowShowing) return;
    void isReleaseCheckScheduled(id).then(setNotifyRequested);
  }, [movie.data?.id, movie.data?.isNowShowing]);

  // Showtimes key off the movie's id, not the slug in the URL, so the cache
  // holds one entry per movie however the screen was reached.
  const showtimeQuery = { movieId: movie.data?.id, date };
  const showtimes = useQuery({
    queryKey: queryKeys.showtimes(showtimeQuery),
    queryFn: () => catalogApi.showtimes(showtimeQuery),
    enabled: Boolean(movie.data?.id),
    // Today's list includes screenings that have already started, because the
    // API returns a whole day. Marking them here keeps the clock read out of
    // render, where it would be an impure call.
    select: (cinemas) => {
      const now = Date.now();
      return cinemas.map((entry) => ({
        ...entry,
        showtimes: entry.showtimes.map((slot) => ({
          ...slot,
          closed: new Date(slot.salesCloseAt).getTime() <= now,
        })),
      }));
    },
  });

  if (movie.isPending) return <LoadingState label="Loading film" />;

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
  const visible = showtimes.data ? applyFilter(showtimes.data, filter) : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ height: BACKDROP_HEIGHT, backgroundColor: colors.surfaceMuted }}>
          {/*
            Not every source ships a landscape still. When only the poster
            exists, it becomes an out-of-focus wash rather than a second, sharp
            copy of the image already sitting on top of it — the poster stays
            the one thing in focus, which is how a film page should read.
          */}
          <Image
            source={film.backdropUrl ?? film.posterUrl}
            style={{ position: 'absolute', width: '100%', height: '100%' }}
            contentFit="cover"
            blurRadius={film.backdropUrl ? 0 : 18}
            contentPosition={{ top: '12%' }}
            transition={220}
            accessible={false}
          />
          {/* Darkened at the top for the back button, then melted into the page
              at the bottom. A hard edge where the wash stops and the page
              begins read as a cropped photo; a fade reads as one surface. */}
          <LinearGradient
            colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.08)', colors.background]}
            locations={[0, 0.45, 1]}
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
        <View
          style={{
            flexDirection: 'row',
            gap: spacing.lg,
            paddingHorizontal: spacing.lg,
            marginTop: -72,
          }}
        >
          <Poster
            uri={film.posterUrl}
            title={film.title}
            rounded={radius.lg}
            style={{
              width: 104,
              aspectRatio: 2 / 3,
              borderWidth: 2,
              borderColor: colors.surface,
              ...elevation.card,
            }}
          />

          <View style={{ flex: 1, paddingTop: 76, gap: spacing.xs }}>
            <Text variant="title" numberOfLines={2}>
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

          {/* Three things people reach for on a film page that are not
              booking: tell someone, read the verdict, add their own. */}
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
                  }. Book it in the app.`,
                })
              }
            />
            <ActionButton
              icon="chatbubble-ellipses-outline"
              label={film.rating.count > 0 ? `Reviews (${film.rating.count})` : 'Reviews'}
              onPress={() => router.push(`/movie/${idOrSlug}/reviews`)}
            />
            <ActionButton
              icon="star-outline"
              label="Rate"
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
          <Text variant="heading" style={{ paddingHorizontal: spacing.lg }}>
            Choose a showtime
          </Text>

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

          <View style={{ paddingHorizontal: spacing.lg }}>
            <Legend />
          </View>

          <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
            {showtimes.isPending ? (
              <>
                <Skeleton style={{ height: 128, borderRadius: 14 }} />
                <Skeleton style={{ height: 128, borderRadius: 14 }} />
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
              visible.map(({ cinema, showtimes: slots }) => (
                <Card key={cinema.id} style={{ gap: spacing.md }}>
                  {/* The venue block is a link now that a venue is a place:
                      it has a map, a phone number and the rest of its week. */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${cinema.name}, ${cinema.address}. Open this cinema`}
                      onPress={() => router.push(`/cinema/${cinema.slug}`)}
                      hitSlop={4}
                      style={{ flex: 1, gap: spacing['2xs'] }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                        <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
                          {cinema.name}
                        </Text>
                        <Ionicons name="chevron-forward" size={13} color={colors.textMuted} />
                      </View>
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {cinema.address}
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
                        onPress={() => router.push(`/showtime/${slot.id}`)}
                      />
                    ))}
                  </View>
                </Card>
              ))
            )}
          </View>
        </View>
        ) : (
          <ComingSoonPanel releaseDate={film.releaseDate} />
        )}
      </ScrollView>
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
