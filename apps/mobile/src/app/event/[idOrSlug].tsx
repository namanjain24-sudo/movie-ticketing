import {
  EVENT_HIGHLIGHT_LABELS,
  EVENT_KIND_SINGULAR,
  EVENT_ORGANISER_LABELS,
  EVENT_PERFORMER_LABELS,
  formatMoney,
} from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { eventsApi } from '../../api/events';
import { ErrorState } from '../../components/query-state';
import { AppBar, Badge, Poster, Skeleton, Text } from '../../components/ui';
import { DateStrip } from '../../features/catalog/date-strip';
import { ShowtimeChip } from '../../features/catalog/showtime-chip';
import { formatMonthDay, upcomingDays } from '../../lib/format';
import { queryKeys } from '../../lib/query-client';
import { useTheme } from '../../theme';

/** `YYYY-MM-DD` for today in the device's own day, not in UTC. */
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * One event, and the dates it is on.
 *
 * Every kind renders through the same layout, with the labels coming from the
 * kind rather than from a branch per screen: `performers` is "Teams" for a
 * match and "Line-up" for a gig, `highlights` is "Match info" or "What you'll
 * learn". Five screens that are 90% the same would drift within a week.
 */
export default function EventDetail() {
  const { idOrSlug } = useLocalSearchParams<{ idOrSlug: string }>();
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();

  const [date, setDate] = useState(todayLocal());
  // Ten days, matching the window the schedule is kept topped up to.
  const [days] = useState(() => upcomingDays(10));
  const [city, setCity] = useState<string | undefined>(undefined);

  const event = useQuery({
    queryKey: queryKeys.event(idOrSlug),
    queryFn: () => eventsApi.detail(idOrSlug),
    enabled: Boolean(idOrSlug),
  });

  const eventId = event.data?.id;

  const cities = useQuery({
    queryKey: queryKeys.eventCities(eventId ?? ''),
    queryFn: () => eventsApi.cities(eventId as string),
    enabled: Boolean(eventId),
    staleTime: 10 * 60_000,
  });

  const shows = useQuery({
    queryKey: queryKeys.eventShows(eventId ?? '', { city, date }),
    queryFn: () => eventsApi.shows(eventId as string, { city, date }),
    enabled: Boolean(eventId),
  });

  if (event.isPending) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <AppBar title="" onBack={() => router.back()} />
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Skeleton style={{ height: 180, borderRadius: 14 }} />
          <Skeleton style={{ height: 24, borderRadius: 8 }} />
          <Skeleton style={{ height: 80, borderRadius: 10 }} />
        </View>
      </View>
    );
  }

  if (event.isError || !event.data) {
    return (
      <ErrorState
        error={event.error}
        title="Could not load this event"
        onRetry={() => void event.refetch()}
      />
    );
  }

  const e = event.data;
  const venueCount = cities.data?.length ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppBar title={e.title} subtitle={EVENT_KIND_SINGULAR[e.kind]} onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          gap: spacing.xl,
          paddingBottom: spacing['2xl'],
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          entering={FadeInDown.duration(280)}
          style={{ flexDirection: 'row', gap: spacing.md }}
        >
          <Poster
            uri={e.posterUrl}
            title={e.title}
            rounded={radius.md}
            style={{ width: 104, aspectRatio: 3 / 4 }}
          />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text variant="heading" numberOfLines={3}>
              {e.title}
            </Text>
            {e.tagline ? (
              <Text variant="caption" tone="muted">
                {e.tagline}
              </Text>
            ) : null}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 4 }}>
              <Badge label={EVENT_KIND_SINGULAR[e.kind]} tone="primary" />
              {e.minAge ? <Badge label={`${e.minAge}+`} variant="outline" /> : null}
              {e.tags.slice(0, 2).map((tag) => (
                <Badge key={tag} label={tag} variant="outline" />
              ))}
            </View>

            {e.fromPriceMinor !== null ? (
              <Text variant="label" numeric style={{ color: colors.primary, marginTop: 4 }}>
                from {formatMoney(e.fromPriceMinor, 'INR')}
              </Text>
            ) : null}
          </View>
        </Animated.View>

        {/* Teams, line-up, cast — the same field under the kind's own word. */}
        {e.performers.length > 0 ? (
          <Section title={EVENT_PERFORMER_LABELS[e.kind]}>
            <Text>{e.performers.join(e.kind === 'SPORT' ? '  vs  ' : ', ')}</Text>
          </Section>
        ) : null}

        {e.organiser ? (
          <Section title={EVENT_ORGANISER_LABELS[e.kind]}>
            <Text>{e.organiser}</Text>
          </Section>
        ) : null}

        <Section title="About">
          <Text tone="muted">{e.description}</Text>
        </Section>

        {e.highlights.length > 0 ? (
          <Section title={EVENT_HIGHLIGHT_LABELS[e.kind]}>
            <View style={{ gap: spacing.sm }}>
              {e.highlights.map((line) => (
                <View key={line} style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={16}
                    color={colors.success}
                    style={{ marginTop: 2 }}
                  />
                  <Text tone="muted" style={{ flex: 1 }}>
                    {line}
                  </Text>
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        <Section title="Choose a date">
          <View style={{ gap: spacing.md }}>
            <DateStrip value={date} onChange={setDate} days={days} />

            {venueCount > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: spacing.sm }}
              >
                {[undefined, ...(cities.data ?? [])].map((c) => (
                  <Pressable
                    key={c ?? 'all'}
                    accessibilityRole="button"
                    accessibilityState={{ selected: city === c }}
                    onPress={() => setCity(c)}
                    style={{
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                      borderRadius: radius.full,
                      borderWidth: 1,
                      borderColor: city === c ? colors.primary : colors.border,
                      backgroundColor: city === c ? colors.primarySolid : colors.surface,
                    }}
                  >
                    <Text
                      variant="caption"
                      style={{ color: city === c ? colors.onPrimary : colors.text }}
                    >
                      {c ?? 'All cities'}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            {shows.isPending ? (
              <Skeleton style={{ height: 90, borderRadius: 12 }} />
            ) : (shows.data?.length ?? 0) === 0 ? (
              <Text tone="muted">Nothing on {formatMonthDay(`${date}T12:00:00`)}.</Text>
            ) : (
              <View style={{ gap: spacing.lg }}>
                {(shows.data ?? []).map((venue) => (
                  <View key={venue.cinema.id} style={{ gap: spacing.sm }}>
                    <View style={{ gap: 2 }}>
                      <Text variant="label">{venue.cinema.name}</Text>
                      <Text variant="caption" tone="muted">
                        {venue.cinema.address}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                      {venue.showtimes.map((show) => (
                        <ShowtimeChip
                          key={show.id}
                          showtime={show}
                          onPress={() => router.push(`/showtime/${show.id}`)}
                        />
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="heading">{title}</Text>
      {children}
    </View>
  );
}
