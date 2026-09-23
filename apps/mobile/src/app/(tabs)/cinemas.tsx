import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { catalogApi } from '../../api/catalog';
import { cinemasApi } from '../../api/cinemas';
import { EmptyState, ErrorState } from '../../components/query-state';
import { AppBar, Skeleton, Text } from '../../components/ui';
import { CinemaCard } from '../../features/cinemas/cinema-card';
import { CinemaMap } from '../../features/cinemas/cinema-map';
import { useUserLocation } from '../../features/cinemas/use-location';
import { queryKeys } from '../../lib/query-client';
import { useTheme } from '../../theme';
import { HIT_SIZE } from '../../theme/tokens';

/** How tall the map is when it sits above the list rather than filling it. */
const MAP_PEEK_HEIGHT = 220;

export default function Cinemas() {
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();

  const [search, setSearch] = useState('');
  const [city, setCity] = useState<string | undefined>(undefined);
  const [brand, setBrand] = useState<string | undefined>(undefined);
  const [mapOpen, setMapOpen] = useState(false);

  const location = useUserLocation();
  const coords = location.state.status === 'granted' ? location.state.coords : null;

  const cities = useQuery({
    queryKey: queryKeys.cities,
    queryFn: catalogApi.cities,
    staleTime: 60 * 60_000,
  });

  const brands = useQuery({
    queryKey: queryKeys.cinemaBrands,
    queryFn: cinemasApi.brands,
    staleTime: 60 * 60_000,
  });

  const trimmed = search.trim();
  const query = useMemo(
    () => ({
      ...(city ? { city } : {}),
      ...(brand ? { brand } : {}),
      ...(trimmed ? { search: trimmed } : {}),
      ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
    }),
    [city, brand, trimmed, coords],
  );

  const cinemas = useQuery({
    queryKey: queryKeys.cinemas(query),
    queryFn: () => cinemasApi.list(query),
  });

  const results = cinemas.data ?? [];

  const nearMeLabel =
    location.state.status === 'asking'
      ? 'Locating…'
      : coords
        ? 'Near me'
        : location.state.status === 'denied'
          ? 'Location off'
          : 'Near me';

  const header = (
    <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
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
            placeholder="Search a cinema or area"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search cinemas"
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

      {/* Filters. "Near me" leads because it is the one that needs permission
          and the one people actually want; the rest narrow what it returns. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
      >
        <Chip
          label={nearMeLabel}
          icon={coords ? 'navigate' : 'navigate-outline'}
          active={Boolean(coords)}
          busy={location.state.status === 'asking'}
          onPress={() => (coords ? location.clear() : void location.request())}
        />
        {city ? <Chip label={city} active onPress={() => setCity(undefined)} dismissible /> : null}
        {brand ? (
          <Chip label={brand} active onPress={() => setBrand(undefined)} dismissible />
        ) : null}

        {!city
          ? (cities.data ?? []).map((name) => (
              <Chip key={name} label={name} active={false} onPress={() => setCity(name)} />
            ))
          : null}
        {!brand && city
          ? (brands.data ?? []).map((name) => (
              <Chip key={name} label={name} active={false} onPress={() => setBrand(name)} />
            ))
          : null}
      </ScrollView>

      {location.state.status === 'denied' ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <Text variant="caption" tone="muted">
            Location is off, so cinemas are listed alphabetically. Turn it on in Settings to sort by
            how far away they are.
          </Text>
        </View>
      ) : null}
      {location.state.status === 'failed' ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <Text variant="caption" tone="danger">
            {location.state.message}
          </Text>
        </View>
      ) : null}

      {mapOpen && results.length > 0 ? (
        <Animated.View
          entering={FadeIn.duration(220)}
          style={{
            height: MAP_PEEK_HEIGHT,
            marginHorizontal: spacing.lg,
            borderRadius: radius.lg,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <CinemaMap
            cinemas={results}
            origin={coords}
            onSelect={(cinema) => router.push(`/cinema/${cinema.slug}`)}
          />
        </Animated.View>
      ) : null}

      {results.length > 0 ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <Text variant="caption" tone="muted" numeric>
            {results.length} {results.length === 1 ? 'cinema' : 'cinemas'}
            {coords ? ' · nearest first' : ''}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (cinemas.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <AppBar title="Cinemas" subtitle="Where to watch" />
        <ErrorState
          error={cinemas.error}
          title="Could not load cinemas"
          onRetry={() => void cinemas.refetch()}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppBar
        title="Cinemas"
        subtitle="Where to watch"
        actions={
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: mapOpen }}
            accessibilityLabel={mapOpen ? 'Hide the map' : 'Show the map'}
            onPress={() => setMapOpen((open) => !open)}
            hitSlop={8}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: spacing.md,
              paddingVertical: 6,
              borderRadius: radius.full,
              backgroundColor: mapOpen ? colors.primary : 'rgba(255,255,255,0.14)',
            }}
          >
            <Ionicons name={mapOpen ? 'list' : 'map-outline'} size={15} color={colors.onChrome} />
            <Text variant="caption" tone="onChrome">
              {mapOpen ? 'List' : 'Map'}
            </Text>
          </Pressable>
        }
      />

      {cinemas.isPending ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Skeleton style={{ height: HIT_SIZE, borderRadius: 10 }} />
          <Skeleton style={{ height: 150, borderRadius: 14 }} />
          <Skeleton style={{ height: 150, borderRadius: 14 }} />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(cinema) => cinema.id}
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <CinemaCard cinema={item} onPress={() => router.push(`/cinema/${item.slug}`)} />
          )}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing['3xl'],
            gap: spacing.md,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={cinemas.isRefetching}
              onRefresh={() => void cinemas.refetch()}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="No cinemas match"
              message={
                trimmed
                  ? `Nothing here matches “${trimmed}”.`
                  : 'Try a different city, or clear the filters.'
              }
              action={
                city || brand || trimmed
                  ? {
                      label: 'Clear filters',
                      onPress: () => {
                        setCity(undefined);
                        setBrand(undefined);
                        setSearch('');
                      },
                    }
                  : undefined
              }
            />
          }
        />
      )}
    </View>
  );
}

function Chip({
  label,
  icon,
  active,
  busy = false,
  dismissible = false,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  active: boolean;
  busy?: boolean;
  dismissible?: boolean;
  onPress: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, busy }}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: active ? colors.accent : colors.border,
        backgroundColor: active ? colors.accentMuted : colors.surface,
      }}
    >
      {icon ? (
        <Ionicons name={icon} size={14} color={active ? colors.accent : colors.textMuted} />
      ) : null}
      <Text variant="label" style={{ color: active ? colors.accent : colors.textMuted }}>
        {label}
      </Text>
      {dismissible ? (
        <Ionicons name="close" size={13} color={active ? colors.accent : colors.textMuted} />
      ) : null}
    </Pressable>
  );
}
