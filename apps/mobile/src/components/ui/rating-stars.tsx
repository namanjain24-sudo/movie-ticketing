import { RATING_MAX, RATING_MIN, ratingLabel } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View, type ViewStyle } from 'react-native';
import { tapFeedback } from '../../lib/haptics';
import { useTheme } from '../../theme';
import { HIT_SIZE } from '../../theme/tokens';
import { Text } from './text';

/**
 * A row of stars, read-only.
 *
 * Half stars are drawn but never *entered*: an average of 4.3 genuinely is
 * between four and five and the row should say so, while a person rating a
 * film is choosing one of five things. The two cases use different components
 * for exactly that reason.
 */
export function RatingStars({
  value,
  size = 14,
  style,
}: {
  /** The average. Fractions are rendered as a half star. */
  value: number;
  size?: number;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();

  return (
    <View
      style={[{ flexDirection: 'row', gap: 1 }, style]}
      accessibilityRole="image"
      accessibilityLabel={ratingLabel(Math.round(value * 10) / 10)}
    >
      {Array.from({ length: RATING_MAX }, (_, i) => {
        const filled = value - i;
        const name = filled >= 0.75 ? 'star' : filled >= 0.25 ? 'star-half' : 'star-outline';
        return (
          <Ionicons
            key={i}
            name={name}
            size={size}
            color={filled >= 0.25 ? colors.warning : colors.borderStrong}
          />
        );
      })}
    </View>
  );
}

/**
 * The average as a compact pill: a star, the number, and how many people said
 * so. The count is not decoration — 4.8 from three people and 4.8 from three
 * hundred are different claims, and showing only the first number hides which
 * one this is.
 */
export function RatingPill({
  average,
  count,
  style,
}: {
  average: number | null;
  count: number;
  style?: ViewStyle;
}) {
  const { colors, radius, spacing } = useTheme();

  if (average === null || count === 0) {
    return (
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
            paddingHorizontal: spacing.sm,
            paddingVertical: 3,
            borderRadius: radius.full,
            backgroundColor: colors.surfaceMuted,
          },
          style,
        ]}
      >
        <Text variant="caption" tone="muted">
          Not rated yet
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 3,
          paddingHorizontal: spacing.sm,
          paddingVertical: 3,
          borderRadius: radius.full,
          backgroundColor: colors.surfaceMuted,
        },
        style,
      ]}
      accessibilityRole="text"
      accessibilityLabel={`${ratingLabel(average)}, from ${count} ${
        count === 1 ? 'review' : 'reviews'
      }`}
    >
      <Ionicons name="star" size={12} color={colors.warning} />
      <Text variant="caption" numeric>
        {average.toFixed(1)}
      </Text>
      <Text variant="caption" tone="muted" numeric>
        ({count})
      </Text>
    </View>
  );
}

/**
 * The interactive version: five taps, one of which is the answer.
 *
 * A slider would be smaller and worse. Five discrete targets say how many
 * choices there are before the first tap, and each one is its own hit area
 * large enough to land on without aiming.
 */
export function RatingInput({
  value,
  onChange,
  size = 36,
}: {
  value: number | null;
  onChange: (rating: number) => void;
  size?: number;
}) {
  const { colors, spacing } = useTheme();

  return (
    <View style={{ flexDirection: 'row', gap: spacing.xs }}>
      {Array.from({ length: RATING_MAX }, (_, i) => {
        const rating = i + RATING_MIN;
        const on = value !== null && rating <= value;
        return (
          <Pressable
            key={rating}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === rating }}
            accessibilityLabel={ratingLabel(rating)}
            hitSlop={6}
            onPress={() => {
              tapFeedback();
              onChange(rating);
            }}
            style={{
              minWidth: HIT_SIZE,
              minHeight: HIT_SIZE,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons
              name={on ? 'star' : 'star-outline'}
              size={size}
              color={on ? colors.warning : colors.borderStrong}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
