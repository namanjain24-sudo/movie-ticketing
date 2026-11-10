import type { MovieSummary } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
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
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Poster, Text } from '../../components/ui';
import { formatRuntime } from '../../lib/format';
import { useTheme } from '../../theme';
import { gradients } from '../../theme/tokens';

const { width: SCREEN } = Dimensions.get('window');
const GUTTER = 16;
/**
 * The gap between cards is the gutter, and that is not a coincidence.
 *
 * A card is the screen less a gutter each side, so when one is snapped its
 * right edge sits a gutter from the screen edge. The next card begins a gap
 * after that, which means anything less than a gutter leaves a slice of it
 * showing. At twelve that slice was four points: too thin to read as "there
 * is more this way", wide enough to read as a dark sliver that should not be
 * there. Matching the gutter puts the next card exactly at the edge, so the
 * carousel pages cleanly and the dots below say what the sliver was failing
 * to.
 */
const GAP = GUTTER;
const CARD_WIDTH = SCREEN - GUTTER * 2;
/** One card to the next, which is also what the list snaps by. */
const PAGE = CARD_WIDTH + GAP;
/**
 * How far the blurred backdrop lags the card it sits in, as a fraction of the
 * distance scrolled.
 *
 * The depth cue is only ever this: things further away move less. A fifth is
 * enough to feel and small enough that nobody catches it happening, and the
 * backdrop is scaled a little so the lag never drags an edge into view.
 */
const PARALLAX = 0.2;
const BACKDROP_SCALE = 1.2;
const POSTER_WIDTH = 116;

/**
 * The first thing on the home screen. The poster keeps its own 2:3 shape rather
 * than being cropped into a banner — the catalogue ships portrait art, and a
 * letterboxed crop of a poster throws away the half that was composed to sell
 * the film.
 */
export function FeaturedRail({
  movies,
  onSelect,
}: {
  movies: MovieSummary[];
  onSelect: (movie: MovieSummary) => void;
}) {
  const { colors, radius, spacing, elevation } = useTheme();
  const [index, setIndex] = useState(0);

  const onScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / PAGE));
  }, []);

  // Written on the UI thread by the scroll itself, so the backdrops move with
  // the finger rather than one React render behind it.
  const scrollX = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  return (
    <View style={{ gap: spacing.md }}>
      <Animated.FlatList
        data={movies}
        horizontal
        keyExtractor={(m) => m.id}
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_WIDTH + GAP}
        decelerationRate="fast"
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onScrollEnd}
        contentContainerStyle={{ paddingHorizontal: GUTTER, gap: GAP }}
        renderItem={({ item, index }) => {
          const rated = item.rating.average !== null && item.rating.count > 0;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.certification}, ${formatRuntime(
                item.durationMins,
              )}. Book tickets`}
              onPress={() => onSelect(item)}
              style={({ pressed }) => [
                {
                  width: CARD_WIDTH,
                  borderRadius: radius.xl,
                  overflow: 'hidden',
                  // Dark in both themes: a hero is a screen in a dark room.
                  backgroundColor: colors.onImageSurface,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.08)',
                  transform: [{ scale: pressed ? 0.985 : 1 }],
                },
                elevation.card,
              ]}
            >
              {/* The poster's own colours, out of focus, as the card's light
                  - and held back a little as the rail moves, which is the
                  only thing depth has ever been on a flat screen. */}
              <Backdrop uri={item.posterUrl} index={index} scrollX={scrollX} />
              <LinearGradient
                colors={[...gradients.scrim]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />

              <View style={{ flexDirection: 'row', gap: spacing.lg, padding: spacing.lg }}>
                <Poster
                  uri={item.posterUrl}
                  title={item.title}
                  rounded={radius.md}
                  style={{ width: POSTER_WIDTH, aspectRatio: 2 / 3, ...elevation.raised }}
                />

                <View style={{ flex: 1, justifyContent: 'center', gap: spacing.sm }}>
                  <Text variant="title" numberOfLines={2} style={{ color: colors.onImage }}>
                    {item.title}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Text variant="caption" style={{ color: colors.onImageMuted }}>
                      {item.certification} · {formatRuntime(item.durationMins)}
                    </Text>
                    {rated ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                        <Ionicons name="star" size={11} color={colors.warning} />
                        <Text variant="caption" numeric style={{ color: colors.onImage }}>
                          {item.rating.average?.toFixed(1)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text variant="caption" numberOfLines={1} style={{ color: colors.onImageMuted }}>
                    {item.genres.join(' · ')}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                    {item.languages.slice(0, 2).map((language) => (
                      <View
                        key={language}
                        style={{
                          paddingHorizontal: spacing.sm,
                          paddingVertical: 2,
                          borderRadius: radius.sm,
                          borderWidth: 1,
                          borderColor: 'rgba(255,255,255,0.35)',
                        }}
                      >
                        <Text variant="overline" style={{ color: 'rgba(255,255,255,0.9)' }}>
                          {language.toUpperCase()}
                        </Text>
                      </View>
                    ))}
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
                        marginTop: spacing.xs,
                        paddingHorizontal: spacing.lg,
                        paddingVertical: spacing.sm,
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
              </View>
            </Pressable>
          );
        }}
      />

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.xs }}>
        {movies.map((m, i) => (
          <View
            key={m.id}
            style={{
              width: i === index ? 18 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: i === index ? colors.primary : colors.borderStrong,
            }}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * The blurred poster behind a card, lagging the rail it is drawn in.
 *
 * Its own component because the animated style has to be a hook, and a hook
 * cannot live inside `renderItem`. Which card this is deciding where it sits
 * relative to the scroll: at rest the offset is zero and the backdrop is
 * centred; a page either side and it has drifted by a fifth of a page.
 */
function Backdrop({
  uri,
  index,
  scrollX,
}: {
  uri: string;
  index: number;
  scrollX: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [
      { scale: BACKDROP_SCALE },
      { translateX: -(scrollX.value - index * PAGE) * PARALLAX },
    ],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Image
        source={uri}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        blurRadius={40}
        cachePolicy="memory-disk"
        accessible={false}
      />
    </Animated.View>
  );
}
