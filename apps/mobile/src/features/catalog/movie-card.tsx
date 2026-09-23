import type { MovieSummary } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Poster, Text } from '../../components/ui';
import { formatMonthDay, formatRuntime } from '../../lib/format';
import { useTheme } from '../../theme';
import { SaveHeart } from '../watchlist/save-heart';

/** Every poster in the catalogue is 2:3, and so is the box that holds it. */
const POSTER_RATIO = 2 / 3;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function MovieCard({
  movie,
  width,
  releaseNote = false,
  onPress,
}: {
  movie: MovieSummary;
  /** Set on a horizontal rail; omitted in a grid, where the column decides. */
  width?: number;
  /** Shows the release date instead of the runtime, for films not yet on sale. */
  releaseNote?: boolean;
  onPress: () => void;
}) {
  const { colors, radius, spacing, elevation } = useTheme();

  /**
   * The card dips under the thumb and springs back. A spring rather than a
   * timing curve because the finger is a physical thing and the card should
   * answer like one — and on the release, the overshoot is the whole tell that
   * the tap registered.
   */
  const pressed = useSharedValue(0);
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.035 }],
  }));

  const rated = movie.rating.average !== null && movie.rating.count > 0;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`${movie.title}. ${movie.certification}, ${formatRuntime(
        movie.durationMins,
      )}, ${movie.genres.join(', ')}${
        rated ? `. Rated ${movie.rating.average} out of 5 from ${movie.rating.count} reviews` : ''
      }`}
      onPress={onPress}
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: 90 });
      }}
      onPressOut={() => {
        pressed.value = withSpring(0, { damping: 14, stiffness: 320 });
      }}
      style={[{ width, flex: width ? undefined : 1, gap: spacing.sm }, cardStyle]}
    >
      <View>
        <Poster
          uri={movie.posterUrl}
          title={movie.title}
          rounded={radius.lg}
          style={{ aspectRatio: POSTER_RATIO, ...elevation.card }}
          overlay={
            rated ? (
              // Sat on the artwork rather than under it: the rating is the single
              // most-scanned number on this screen, and putting it in the caption
              // block below buries it behind the title.
              <LinearGradient
                colors={['rgba(16,16,21,0)', 'rgba(16,16,21,0.82)']}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.xs,
                  paddingHorizontal: spacing.sm,
                  paddingTop: spacing.lg,
                  paddingBottom: spacing.sm,
                }}
              >
                <Ionicons name="star" size={11} color={colors.warning} />
                <Text variant="caption" numeric style={{ color: colors.onImage }}>
                  {movie.rating.average?.toFixed(1)}
                </Text>
                <Text variant="caption" numeric style={{ color: 'rgba(255,255,255,0.68)' }}>
                  ({movie.rating.count})
                </Text>
              </LinearGradient>
            ) : null
          }
        />
        <SaveHeart movie={movie} />
      </View>

      <View style={{ gap: spacing['2xs'] }}>
        <Text variant="label" numberOfLines={1}>
          {movie.title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {movie.genres.slice(0, 2).join(' · ')}
        </Text>
        <Text
          variant="caption"
          tone={releaseNote ? 'primary' : 'muted'}
          numberOfLines={1}
          numeric={releaseNote}
        >
          {releaseNote
            ? `Releases ${formatMonthDay(movie.releaseDate)}`
            : `${movie.certification} · ${formatRuntime(movie.durationMins)}`}
        </Text>
      </View>
    </AnimatedPressable>
  );
}
