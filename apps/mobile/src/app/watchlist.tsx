import type { MovieSummary } from '@app/shared';
import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { EmptyState, ErrorState } from '../components/query-state';
import { AppBar, Skeleton } from '../components/ui';
import { MovieCard } from '../features/catalog/movie-card';
import { useWatchlist } from '../features/watchlist/use-watchlist';
import { useTheme } from '../theme';

const COLUMNS = 2;

export default function Watchlist() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const watchlist = useWatchlist();

  const open = (movie: MovieSummary) => router.push(`/movie/${movie.slug}`);

  const count = watchlist.movies?.length ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppBar
        title="Saved films"
        subtitle={count > 0 ? `${count} film${count === 1 ? '' : 's'}` : undefined}
        onBack={() => router.back()}
      />

      {watchlist.isPending ? (
        <View
          style={{
            flexDirection: 'row',
            gap: spacing.lg,
            padding: spacing.lg,
          }}
        >
          <Skeleton style={{ flex: 1, aspectRatio: 2 / 3, borderRadius: 14 }} />
          <Skeleton style={{ flex: 1, aspectRatio: 2 / 3, borderRadius: 14 }} />
        </View>
      ) : watchlist.isError ? (
        <ErrorState
          error={watchlist.error}
          title="Could not load your saved films"
          onRetry={() => void watchlist.refetch()}
        />
      ) : (
        <FlatList
          data={watchlist.movies}
          keyExtractor={(movie) => movie.id}
          renderItem={({ item, index }) => (
            <Animated.View
              entering={FadeInDown.delay(Math.min(Math.floor(index / COLUMNS), 6) * 50).duration(
                280,
              )}
              style={{ flex: 1 }}
            >
              <MovieCard movie={item} onPress={() => open(item)} />
            </Animated.View>
          )}
          numColumns={COLUMNS}
          columnWrapperStyle={{ gap: spacing.lg, paddingHorizontal: spacing.lg }}
          contentContainerStyle={{
            paddingTop: spacing.lg,
            paddingBottom: spacing['2xl'],
            gap: spacing.xl,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => void watchlist.refetch()}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="heart-outline"
              title="Nothing saved yet"
              message="Tap the heart on any film to keep it here for later."
              action={{ label: 'Browse films', onPress: () => router.replace('/(tabs)') }}
            />
          }
        />
      )}
    </View>
  );
}
