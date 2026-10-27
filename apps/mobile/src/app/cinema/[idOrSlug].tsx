import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { catalogApi } from '../../api/catalog';
import { cinemasApi } from '../../api/cinemas';
import { ErrorState } from '../../components/query-state';
import { AppBar, Button, Poster, Skeleton, Text } from '../../components/ui';
import { CinemaMap } from '../../features/cinemas/cinema-map';
import { DateStrip } from '../../features/catalog/date-strip';
import { groupBySubject } from '../../features/catalog/group-by-subject';
import { ShowtimeChip } from '../../features/catalog/showtime-chip';
import { toDateKey, upcomingDays } from '../../lib/format';
import { callNumber, openDirections, openPlace } from '../../lib/maps';
import { queryKeys } from '../../lib/query-client';
import { useTheme } from '../../theme';
import { markClosed, nextCloseAfter } from '../../features/catalog/closing';
import { useTickAt } from '../../lib/use-tick-at';

/** Days of programming offered, matching the seed's seven-day horizon. */
const DAYS = 7;

const MAP_HEIGHT = 200;

export default function CinemaScreen() {
  const { idOrSlug } = useLocalSearchParams<{ idOrSlug: string }>();
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();

  const days = useMemo(() => upcomingDays(DAYS), []);
  const [date, setDate] = useState(() => toDateKey(new Date()));

  const cinema = useQuery({
    queryKey: queryKeys.cinema(idOrSlug),
    queryFn: () => cinemasApi.get(idOrSlug),
    enabled: Boolean(idOrSlug),
  });

  /**
   * Showtimes are fetched for the cinema's whole city and narrowed here.
   *
   * The endpoint groups by cinema already, so the city's response contains this
   * venue's block intact — and the same response is what the home screen
   * caches, so switching between a film and a venue on the same day usually
   * costs nothing.
   */
  const city = cinema.data?.city;
  const showtimes = useQuery({
    queryKey: queryKeys.showtimes({ city, date }),
    queryFn: () => catalogApi.showtimes({ city, date }),
    enabled: Boolean(city),
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

  const here = marked?.find((entry) => entry.cinema.id === cinema.data?.id);

  if (cinema.isPending) return <CinemaScreenSkeleton />;

  if (cinema.isError || !cinema.data) {
    return (
      <ErrorState
        error={cinema.error}
        title="Could not load this cinema"
        onRetry={() => void cinema.refetch()}
      />
    );
  }

  const venue = cinema.data;
  const place = { latitude: venue.latitude, longitude: venue.longitude, label: venue.name };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppBar title={venue.name} subtitle={venue.brand} onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing['3xl'], gap: spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        {/* The map is the first thing on the screen because "where is it" is
            the first question anyone opens a venue page to answer. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${venue.name} in Maps`}
          onPress={() => void openPlace(place)}
          style={{ height: MAP_HEIGHT }}
        >
          <CinemaMap
            cinemas={[
              {
                ...venue,
                screenCount: 0,
                nowShowingCount: 0,
                fromPriceMinor: null,
                distanceKm: null,
              },
            ]}
            origin={null}
            selectedId={venue.id}
          />
        </Pressable>

        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
            <Ionicons name="location-outline" size={18} color={colors.textMuted} />
            <Text tone="muted" style={{ flex: 1 }}>
              {venue.address}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Button
              label="Directions"
              variant="secondary"
              fullWidth={false}
              style={{ flex: 1 }}
              onPress={() => void openDirections(place)}
            />
            {venue.phone ? (
              <Button
                label="Call"
                variant="ghost"
                fullWidth={false}
                style={{ flex: 1 }}
                onPress={() => void callNumber(venue.phone!)}
              />
            ) : null}
          </View>

          {venue.amenities.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {venue.amenities.map((amenity) => (
                <View
                  key={amenity}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 4,
                    borderRadius: radius.full,
                    backgroundColor: colors.surfaceMuted,
                  }}
                >
                  <Ionicons name="checkmark" size={12} color={colors.success} />
                  <Text variant="caption" tone="muted">
                    {amenity}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={{ gap: spacing.md }}>
          <View style={{ paddingHorizontal: spacing.lg }}>
            <Text variant="heading">What&rsquo;s on</Text>
          </View>
          <DateStrip days={days} value={date} onChange={setDate} />

          {showtimes.isPending ? (
            <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
              <Skeleton style={{ height: 72, borderRadius: 10 }} />
              <Skeleton style={{ height: 72, borderRadius: 10 }} />
            </View>
          ) : showtimes.isError ? (
            /**
             * `here` is `marked?.find(...)`, which is undefined when
             * the request failed exactly as it is when the day is genuinely
             * empty. Without this branch a 500 or a dropped connection was
             * reported to the user as "nothing scheduled here on this day",
             * which is a statement about the cinema's programme that we have
             * no evidence for, and offered nothing to retry.
             */
            <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
              <Text tone="muted">Could not load this day&rsquo;s showtimes.</Text>
              <Button
                label="Try again"
                variant="secondary"
                fullWidth={false}
                onPress={() => void showtimes.refetch()}
              />
            </View>
          ) : !here || here.showtimes.length === 0 ? (
            <View style={{ paddingHorizontal: spacing.lg }}>
              <Text tone="muted">Nothing scheduled here on this day.</Text>
            </View>
          ) : (
            <View style={{ paddingHorizontal: spacing.lg, gap: spacing.xl }}>
              {groupBySubject(here.showtimes).map(({ subject, showtimes: slots }, index) => (
                <Animated.View
                  key={subject.id}
                  entering={FadeInDown.delay(Math.min(index, 6) * 40).duration(260)}
                  style={{ gap: spacing.sm }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${subject.title}. Open this ${subject.kindLabel.toLowerCase()}`}
                    onPress={() => subject.href && router.push(subject.href)}
                    disabled={!subject.href}
                    hitSlop={4}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
                  >
                    <Poster
                      uri={subject.posterUrl}
                      title={subject.title}
                      rounded={radius.sm}
                      style={{ width: 32, aspectRatio: 2 / 3 }}
                    />
                    <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>
                      {subject.title}
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                  </Pressable>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                    {slots.map((show) => (
                      <ShowtimeChip
                        key={show.id}
                        showtime={show}
                        closed={show.closed}
                        onPress={() => router.push(`/showtime/${show.id}`)}
                      />
                    ))}
                  </View>
                </Animated.View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** Shaped like the page: a map, the address block, then a couple of
 * showtime-sized bars — so the venue page doesn't flash blank before a
 * spinner, then flash again into its real layout. */
function CinemaScreenSkeleton() {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppBar title="Cinema" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing['3xl'], gap: spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <Skeleton style={{ height: MAP_HEIGHT, borderRadius: 0 }} />
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          <Skeleton style={{ height: 16, width: '70%', borderRadius: 6 }} />
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Skeleton style={{ flex: 1, height: 44, borderRadius: 10 }} />
            <Skeleton style={{ flex: 1, height: 44, borderRadius: 10 }} />
          </View>
        </View>
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          <Skeleton style={{ height: 22, width: 120, borderRadius: 6 }} />
          <Skeleton style={{ height: 72, borderRadius: 10 }} />
          <Skeleton style={{ height: 72, borderRadius: 10 }} />
        </View>
      </ScrollView>
    </View>
  );
}
