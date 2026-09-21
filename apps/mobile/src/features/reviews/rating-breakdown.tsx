import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { RatingStars, Text } from '../../components/ui';
import { useTheme } from '../../theme';

/**
 * The average, and the shape behind it.
 *
 * A single number hides the argument. Four stars from a room that agreed and
 * four stars from a room that split between fives and ones are different films
 * to walk into, and the bar chart is the only part of this screen that says
 * which one you are looking at. Each bar is also a filter: tapping the one-star
 * row is how someone finds out what the objection actually was.
 */
export function RatingBreakdown({
  average,
  count,
  breakdown,
  activeRating,
  onFilter,
}: {
  average: number | null;
  count: number;
  breakdown: { rating: number; count: number }[];
  activeRating?: number;
  onFilter: (rating: number | undefined) => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const busiest = Math.max(1, ...breakdown.map((b) => b.count));

  if (average === null || count === 0) {
    return (
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.xs }}>
        <Text variant="heading">No reviews yet</Text>
        <Text variant="caption" tone="muted">
          Be the first to say what you thought.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: spacing.xl,
        paddingHorizontal: spacing.lg,
        alignItems: 'center',
      }}
    >
      <View style={{ alignItems: 'center', gap: 2 }}>
        <Text variant="display" numeric>
          {average.toFixed(1)}
        </Text>
        <RatingStars value={average} size={13} />
        <Text variant="caption" tone="muted" numeric>
          {count} {count === 1 ? 'review' : 'reviews'}
        </Text>
      </View>

      <View style={{ flex: 1, gap: 3 }}>
        {breakdown.map((row) => {
          const active = activeRating === row.rating;
          return (
            <Pressable
              key={row.rating}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${row.count} ${
                row.count === 1 ? 'review' : 'reviews'
              } at ${row.rating} stars${active ? ', showing only these' : ''}`}
              // A bar with no reviews behind it filters to an empty list, which
              // is a worse answer than not being pressable.
              disabled={row.count === 0}
              onPress={() => onFilter(active ? undefined : row.rating)}
              hitSlop={4}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
            >
              <Text
                variant="caption"
                tone={active ? 'primary' : 'muted'}
                numeric
                style={{ width: 10 }}
              >
                {row.rating}
              </Text>
              <Ionicons
                name="star"
                size={10}
                color={active ? colors.primary : colors.borderStrong}
              />
              <View
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: radius.full,
                  backgroundColor: colors.surfaceMuted,
                  overflow: 'hidden',
                }}
              >
                <Animated.View
                  entering={FadeIn.duration(220)}
                  style={{
                    width: `${(row.count / busiest) * 100}%`,
                    height: '100%',
                    borderRadius: radius.full,
                    backgroundColor: active ? colors.primary : colors.warning,
                  }}
                />
              </View>
              <Text variant="caption" tone="muted" numeric style={{ width: 20 }} align="right">
                {row.count}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
