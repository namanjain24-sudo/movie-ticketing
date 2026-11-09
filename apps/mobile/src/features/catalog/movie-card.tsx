import type { MovieSummary } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import { Poster, Text } from '../../components/ui';
import { formatMonthDay, formatRuntime } from '../../lib/format';
import { AnimatedPressable, usePressScale } from '../../lib/use-press-scale';
import { useTheme } from '../../theme';
import { SaveHeart } from '../watchlist/save-heart';

/** Every poster in the catalogue is 2:3, and so is the box that holds it. */
const POSTER_RATIO = 2 / 3;

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
  const press = usePressScale();

  const rated = movie.rating.average !== null && movie.rating.count > 0;

  /**
   * A narrow card cannot carry an 18pt title.
   *
   * The grid is three columns now, which is about 110pt a card, and the rails
   * are narrower still. "Drishyam: The Conclusion" at `heading` in 110pt is
   * one truncated word. The threshold is where two or three words of a real
   * film name stop fitting, not a round number.
   */
  const titleVariant = width !== undefined && width < 150 ? 'label' : 'heading';

  return (
    // SaveHeart is a sibling here, not a descendant of the card's Pressable:
    // on web a Pressable with accessibilityRole="button" renders as a real
    // <button>, and a <button> nested inside another <button> is invalid
    // HTML that React warns about and browsers handle inconsistently (the
    // inner tap can get swallowed by the outer one). Sitting it outside the
    // Pressable but still inside this same relatively-positioned wrapper
    // keeps its absolute top-right placement on the poster unchanged.
    <View style={{ width, flex: width ? undefined : 1 }}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={`${movie.title}. ${movie.certification}, ${formatRuntime(
          movie.durationMins,
        )}, ${movie.genres.join(', ')}${
          rated ? `. Rated ${movie.rating.average} out of 5 from ${movie.rating.count} reviews` : ''
        }`}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[{ gap: spacing.sm }, press.style]}
      >
        <Poster
          uri={movie.posterUrl}
          title={movie.title}
          rounded={radius.xl}
          style={{ aspectRatio: POSTER_RATIO, ...elevation.card }}
          overlay={
            rated ? (
              // A compact pill rather than a full-width gradient across the
              // bottom third. The rating is still the most-scanned number on
              // this screen, but the gradient was paying for it by dimming
              // artwork this catalogue cannot spare: its posters are 260 to
              // 283 pixels wide, already upscaled on any phone, and darkening
              // the bottom of one costs more than the number gains.
              //
              // `onImage*`, not literals, because a poster is never
              // theme-tinted: these are the tokens that do not flip.
              <View
                style={{
                  alignSelf: 'flex-start',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.xs,
                  margin: spacing.sm,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing['2xs'],
                  borderRadius: radius.full,
                  backgroundColor: colors.onImageScrim,
                }}
              >
                <Ionicons name="star" size={11} color={colors.warning} />
                <Text variant="caption" numeric style={{ color: colors.onImage }}>
                  {movie.rating.average?.toFixed(1)}
                </Text>
                <Text variant="caption" numeric style={{ color: colors.onImageMuted }}>
                  ({movie.rating.count})
                </Text>
              </View>
            ) : null
          }
        />

        <View style={{ gap: spacing['2xs'] }}>
          <Text variant={titleVariant} numberOfLines={2}>
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

      <SaveHeart movie={movie} />
    </View>
  );
}
