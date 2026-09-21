import { SHOW_FORMAT_LABELS, formatMoney } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { catalogApi } from '../../api/catalog';
import { cinemasApi } from '../../api/cinemas';
import { ErrorState, LoadingState } from '../../components/query-state';
import { AppBar, Button, Text } from '../../components/ui';
import { CinemaMap } from '../../features/cinemas/cinema-map';
import { DateStrip } from '../../features/catalog/date-strip';
import { AVAILABILITY_LABELS, availabilityColor } from '../../features/catalog/availability';
import { formatTime, toDateKey, upcomingDays } from '../../lib/format';
import { callNumber, openDirections, openPlace } from '../../lib/maps';
import { queryKeys } from '../../lib/query-client';
import { useTheme } from '../../theme';

/** Days of programming offered, matching the seed's seven-day horizon. */
const DAYS = 7;

const MAP_HEIGHT = 200;

export default function CinemaScreen() {
  const { idOrSlug } = useLocalSearchParams<{ idOrSlug: string }>();
  const router = useRouter();
  const { colors, radius, spacing, elevation } = useTheme();

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

  const here = showtimes.data?.find((entry) => entry.cinema.id === cinema.data?.id);

  if (cinema.isPending) return <LoadingState label="Loading cinema" />;

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
            <View style={{ paddingVertical: spacing.xl }}>
              <LoadingState />
            </View>
          ) : !here || here.showtimes.length === 0 ? (
            <View style={{ paddingHorizontal: spacing.lg }}>
              <Text tone="muted">Nothing scheduled here on this day.</Text>
            </View>
          ) : (
            <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
              {here.showtimes.map((show) => {
                const soldOut = show.availability === 'SOLD_OUT';
                return (
                  <Pressable
                    key={show.id}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: soldOut }}
                    accessibilityLabel={`${formatTime(show.startsAt)}, ${
                      SHOW_FORMAT_LABELS[show.format]
                    }, ${show.language}, ${AVAILABILITY_LABELS[show.availability]}`}
                    disabled={soldOut}
                    onPress={() => router.push(`/showtime/${show.id}`)}
                    style={({ pressed }) => [
                      {
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing.md,
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                        borderWidth: 1,
                        borderRadius: radius.md,
                        paddingHorizontal: spacing.lg,
                        paddingVertical: spacing.md,
                        opacity: soldOut ? 0.5 : pressed ? 0.8 : 1,
                      },
                      elevation.card,
                    ]}
                  >
                    <View style={{ gap: 2 }}>
                      <Text variant="heading" numeric>
                        {formatTime(show.startsAt)}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {SHOW_FORMAT_LABELS[show.format]} · {show.language}
                      </Text>
                    </View>

                    <View style={{ flex: 1, alignItems: 'flex-end', gap: 2 }}>
                      <Text variant="label" numeric>
                        {formatMoney(show.fromPriceMinor, show.currency)}
                      </Text>
                      <Text
                        variant="caption"
                        style={{ color: availabilityColor(show.availability, colors) }}
                      >
                        {AVAILABILITY_LABELS[show.availability]}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
