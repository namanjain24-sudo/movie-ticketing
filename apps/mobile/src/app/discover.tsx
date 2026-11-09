import type { MovieSummary } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { catalogApi } from '../api/catalog';
import { ErrorState, LoadingState } from '../components/query-state';
import { Button, Poster, RatingPill, Text } from '../components/ui';
import { useWatchlist } from '../features/watchlist/use-watchlist';
import { formatRuntime } from '../lib/format';
import { tapFeedback } from '../lib/haptics';
import { queryKeys } from '../lib/query-client';
import { useTheme } from '../theme';
import { HIT_SIZE } from '../theme/tokens';

/**
 * One film at a time, swiped vertically.
 *
 * The obvious build for this is full-bleed artwork with the title over it, and
 * this catalogue cannot do that: its posters are 260 to 283 pixels wide and
 * not one film has a backdrop, so a full-screen image would be a four-times
 * upscale of a thumbnail. Pretending otherwise would make the funkiest screen
 * in the app also the blurriest.
 *
 * So the composition is type first and the poster is an inset, held at a size
 * the file can actually fill. That is a real direction rather than a
 * concession: it is legible, it is fast, and it is the same decision the home
 * hero makes for the same reason. If the catalogue ever gets 780px artwork,
 * this screen is where it should be spent.
 */
export default function DiscoverScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const movies = useQuery({ queryKey: queryKeys.movies({}), queryFn: () => catalogApi.movies({}) });

  // The pager's page is the window minus the bars, so a snap lands a film
  // exactly in the viewport rather than a film and a sliver of the next.
  const pageHeight = height - insets.top - insets.bottom;

  if (movies.isPending) return <LoadingState />;
  if (movies.isError) {
    return <ErrorState title="Could not load films" error={movies.error} />;
  }

  const films = movies.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={films}
        keyExtractor={(film) => film.id}
        pagingEnabled
        snapToInterval={pageHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, index) => ({
          length: pageHeight,
          offset: pageHeight * index,
          index,
        })}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        renderItem={({ item, index }) => (
          <DiscoverPage film={item} height={pageHeight} index={index} />
        )}
      />

      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Close"
        hitSlop={8}
        style={{
          position: 'absolute',
          top: insets.top + spacing.sm,
          right: spacing.lg,
          width: HIT_SIZE,
          height: HIT_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 999,
          backgroundColor: colors.glass,
          borderWidth: 1,
          borderColor: colors.glassBorder,
        }}
      >
        <Ionicons name="close" size={20} color={colors.text} />
      </Pressable>
    </View>
  );
}

function DiscoverPage({
  film,
  height,
  index,
}: {
  film: MovieSummary;
  height: number;
  index: number;
}) {
  const router = useRouter();
  const { colors, radius, spacing, gradients } = useTheme();
  const watchlist = useWatchlist();
  const saved = watchlist.isSaved(film.id);

  return (
    <View style={{ height, justifyContent: 'flex-end', paddingBottom: spacing['2xl'] }}>
      {/* The night gradient gives the page a floor for the type to sit on,
          which a flat background does not. */}
      <LinearGradient
        colors={[...gradients.night]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: height * 0.7 }}
      />

      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        <Animated.View entering={FadeIn.duration(260)} style={{ alignSelf: 'flex-start' }}>
          <Poster
            uri={film.posterUrl}
            title={film.title}
            rounded={radius['2xl']}
            style={{ width: 168, height: 244 }}
            priority={index < 2 ? 'high' : 'normal'}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(300)} style={{ gap: spacing.sm }}>
          <Text variant="displayLg" numberOfLines={3}>
            {film.title}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            {film.rating.average !== null ? (
              <RatingPill average={film.rating.average} count={film.rating.count} />
            ) : null}
            <Text variant="caption" tone="muted" numeric>
              {formatRuntime(film.durationMins)} · {film.certification}
            </Text>
          </View>

          <Text variant="caption" tone="muted" numberOfLines={1}>
            {film.genres.slice(0, 3).join(' · ')}
            {film.languages.length > 0 ? ` · ${film.languages.slice(0, 2).join(', ')}` : ''}
          </Text>
        </Animated.View>

        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Button label="Book tickets" onPress={() => router.push(`/movie/${film.slug}`)} />
          </View>
          <Pressable
            onPress={() => {
              tapFeedback();
              watchlist.toggle(film);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: saved }}
            accessibilityLabel={saved ? `Remove ${film.title} from saved` : `Save ${film.title}`}
            style={{
              width: HIT_SIZE + 6,
              height: HIT_SIZE + 6,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.full,
              backgroundColor: saved ? colors.primaryMuted : colors.surfaceMuted,
            }}
          >
            <Ionicons
              name={saved ? 'heart' : 'heart-outline'}
              size={22}
              color={saved ? colors.primary : colors.textMuted}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
