import { EVENT_KIND_LABELS, type EventKind } from '@app/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { catalogApi } from '../../api/catalog';
import { eventsApi } from '../../api/events';
import { EmptyState, ErrorState } from '../../components/query-state';
import { AppBar, Skeleton, Text } from '../../components/ui';
import { EventCard } from '../../features/events/event-card';
import { useDebouncedValue } from '../../lib/use-debounced-value';
import { tapFeedback } from '../../lib/haptics';
import { queryKeys } from '../../lib/query-client';
import { useTheme } from '../../theme';
import { HIT_SIZE } from '../../theme/tokens';

/**
 * Everything that is not a film: matches, concerts, comedy, workshops and
 * theatre.
 *
 * The chips come from the API rather than from `EVENT_KINDS`, so the screen
 * never offers "Workshops" in a city with no workshop on. A filter that can
 * only ever disappoint is worse than one fewer filter.
 */
export default function Events() {
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();

  const [kind, setKind] = useState<EventKind | undefined>(undefined);
  const [city, setCity] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const query = useDebouncedValue(search.trim(), 300);

  const cities = useQuery({
    queryKey: queryKeys.cities,
    queryFn: catalogApi.cities,
    staleTime: 60 * 60_000,
  });

  const filters = { kind, city, q: query || undefined };
  const events = useQuery({
    queryKey: queryKeys.events(filters),
    queryFn: () => eventsApi.list(filters),
  });

  const chip = (label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={{
        paddingHorizontal: spacing.md,
        minHeight: HIT_SIZE - 8,
        justifyContent: 'center',
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primarySolid : colors.surface,
      }}
    >
      <Text variant="label" style={{ color: selected ? colors.onPrimary : colors.text }}>
        {label}
      </Text>
    </Pressable>
  );

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          marginHorizontal: spacing.lg,
          paddingHorizontal: spacing.md,
          minHeight: HIT_SIZE,
          borderRadius: radius.full,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <TextInput
          accessibilityLabel="Search events"
          placeholder="Search a team, an artist, a workshop"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          style={{ flex: 1, color: colors.text, paddingVertical: spacing.sm }}
        />
      </View>

      {/* Category. Only the kinds that have something on. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
      >
        {chip('All', kind === undefined, () => setKind(undefined))}
        {(events.data?.availableKinds ?? []).map((k) =>
          chip(EVENT_KIND_LABELS[k], kind === k, () => setKind(kind === k ? undefined : k)),
        )}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
      >
        {chip('All cities', city === undefined, () => setCity(undefined))}
        {(cities.data ?? []).map((c) =>
          chip(c, city === c, () => setCity(city === c ? undefined : c)),
        )}
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppBar title="Events" subtitle="Live" />

      {events.isPending ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Skeleton style={{ height: 44, borderRadius: 22 }} />
          <Skeleton style={{ height: 120, borderRadius: 14 }} />
          <Skeleton style={{ height: 120, borderRadius: 14 }} />
        </View>
      ) : events.isError ? (
        <ErrorState
          error={events.error}
          title="Could not load events"
          onRetry={() => void events.refetch()}
          exit={false}
        />
      ) : (
        <Animated.View key={kind ?? 'all'} entering={FadeIn.duration(180)} style={{ flex: 1 }}>
          <FlatList
            data={events.data?.events ?? []}
            keyExtractor={(event) => event.id}
            ListHeaderComponent={header}
            renderItem={({ item, index }) => (
              <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 40).duration(260)}>
                <EventCard event={item} onPress={() => router.push(`/event/${item.slug}`)} />
              </Animated.View>
            )}
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing['2xl'],
              gap: spacing.md,
            }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={events.isRefetching}
                onRefresh={() => void events.refetch()}
                tintColor={colors.primary}
              />
            }
            ListEmptyComponent={
              <EmptyState
                icon="calendar-outline"
                title="Nothing on here"
                message={
                  city
                    ? `No events in ${city} match that. Try another city.`
                    : 'No events match that search.'
                }
              />
            }
          />
        </Animated.View>
      )}
    </View>
  );
}
