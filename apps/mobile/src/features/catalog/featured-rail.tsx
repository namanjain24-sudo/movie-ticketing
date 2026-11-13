import type { MovieSummary } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useState } from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { Text } from '../../components/ui';
import { formatRuntime } from '../../lib/format';
import { useTheme } from '../../theme';
import { gradients } from '../../theme/tokens';

const { width: SCREEN, height: WINDOW } = Dimensions.get('window');

/**
 * How tall the hero stands.
 *
 * A poster is 2:3, so full-bleed it wants to be a screen and a half tall -
 * more than the viewport, and the whole film would never be on screen at
 * once. Just under two thirds of the window leaves the top of the artwork
 * doing the work, the title legible over the bottom of it, and enough of the
 * page below to say the screen keeps going.
 */
const HERO_HEIGHT = Math.min(Math.round(WINDOW * 0.62), Math.round(SCREEN * 1.5));

/**
 * How far the artwork lags the page it is in, as a fraction of the distance
 * scrolled. The only depth cue a flat screen has: things further away move
 * less. The image is scaled a little so the lag never drags an edge in.
 */
const PARALLAX = 0.2;
const ARTWORK_SCALE = 1.16;

/**
 * The first thing on the home screen, and now the size of one.
 *
 * It used to be a card: a 116-point poster beside three lines of text on a
 * dark rectangle, with a third of the screen above it spent on a greeting, a
 * headline and a search field before any film appeared at all. The app's best
 * asset is its artwork and it was being shown at the size of a thumbnail.
 *
 * Full-bleed now, with the title and the price of entry over the bottom of
 * the picture and the picture melting into the page under them. The image is
 * anchored to its top because posters put faces there and a centre crop takes
 * the chin off every one of them.
 */
export function FeaturedRail({
  movies,
  onSelect,
}: {
  movies: MovieSummary[];
  onSelect: (movie: MovieSummary) => void;
}) {
  const { colors, spacing } = useTheme();
  const [index, setIndex] = useState(0);

  const onScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN));
  }, []);

  // Written on the UI thread by the scroll itself, so the artwork moves with
  // the finger rather than one React render behind it.
  const scrollX = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  return (
    <View>
      <Animated.FlatList
        data={movies}
        horizontal
        pagingEnabled
        keyExtractor={(m) => m.id}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onScrollEnd}
        renderItem={({ item, index: i }) => (
          <HeroPanel movie={item} index={i} scrollX={scrollX} onPress={() => onSelect(item)} />
        )}
      />

      {/* Over the bottom of the artwork rather than under it: the gradient
          has already taken the picture down to the page colour by then, so
          the dots sit on the page and cost no height. */}
      <View
        style={{
          position: 'absolute',
          bottom: spacing.md,
          left: 0,
          right: 0,
          flexDirection: 'row',
          justifyContent: 'center',
          gap: spacing.xs,
        }}
        pointerEvents="none"
      >
        {movies.map((movie, i) => (
          <View
            key={movie.id}
            style={{
              width: i === index ? 20 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: i === index ? colors.primary : colors.border,
            }}
          />
        ))}
      </View>
    </View>
  );
}

function HeroPanel({
  movie,
  index,
  scrollX,
  onPress,
}: {
  movie: MovieSummary;
  index: number;
  scrollX: SharedValue<number>;
  onPress: () => void;
}) {
  const { colors, radius, spacing, elevation } = useTheme();

  const artwork = useAnimatedStyle(() => ({
    transform: [
      { scale: ARTWORK_SCALE },
      { translateX: -(scrollX.value - index * SCREEN) * PARALLAX },
    ],
  }));

  const rated = movie.rating.average !== null && movie.rating.count > 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${movie.title}. ${movie.certification}, ${formatRuntime(
        movie.durationMins,
      )}. Book tickets`}
      onPress={onPress}
      style={{ width: SCREEN, height: HERO_HEIGHT }}
    >
      <Animated.View style={[StyleSheet.absoluteFill, artwork]} pointerEvents="none">
        <Image
          source={movie.posterUrl}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          // Posters put faces at the top. A centre crop takes the chin off
          // every one of them.
          contentPosition="top"
          cachePolicy="memory-disk"
          transition={240}
          accessible={false}
        />
      </Animated.View>

      {/* Transparent over the face, the page colour by the time it reaches
          the bottom, so the artwork ends without an edge - and solidly dark
          through the band the title sits in. At a gentler middle stop the
          poster's own credit block ("STAR STUDIOS presents") read straight
          through the overlay and the hero looked like two posters at once. */}
      <LinearGradient
        colors={['transparent', 'rgba(11,11,16,0.35)', 'rgba(11,11,16,0.88)', colors.background]}
        // The fade to the page is late and short. Held longer and ended
        // sooner, the artwork meets the page as an edge; stretched out it
        // becomes a band that is neither picture nor page, and on a light
        // theme that band is where the title loses its contrast.
        locations={[0.22, 0.5, 0.86, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View
        style={{
          position: 'absolute',
          left: spacing.lg,
          right: spacing.lg,
          bottom: spacing['2xl'],
          gap: spacing.sm,
        }}
      >
        <Text variant="displayLg" numberOfLines={2} style={{ color: colors.onImage }}>
          {movie.title}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text variant="label" style={{ color: colors.onImageMuted }}>
            {movie.certification} · {formatRuntime(movie.durationMins)}
          </Text>
          {rated ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing['2xs'] }}>
              <Ionicons name="star" size={13} color={colors.accent} />
              <Text variant="label" numeric style={{ color: colors.onImage }}>
                {movie.rating.average?.toFixed(1)}
              </Text>
            </View>
          ) : null}
          <Text variant="label" style={{ color: colors.onImageMuted }} numberOfLines={1}>
            {movie.genres.slice(0, 2).join(' · ')}
          </Text>
        </View>

        <LinearGradient
          colors={gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            {
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
              marginTop: spacing['2xs'],
              paddingHorizontal: spacing.xl,
              paddingVertical: spacing.md,
              borderRadius: radius.full,
            },
            elevation.glow,
          ]}
        >
          <Text variant="label" style={{ color: colors.onImage }}>
            Book tickets
          </Text>
          <Ionicons name="arrow-forward" size={14} color={colors.onImage} />
        </LinearGradient>
      </View>
    </Pressable>
  );
}
