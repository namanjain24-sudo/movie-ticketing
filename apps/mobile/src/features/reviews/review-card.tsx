import type { Review } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';
import { RatingStars, Text } from '../../components/ui';
import { formatRelativeDay } from '../../lib/format';
import { useTheme } from '../../theme';

/** Initials for the avatar disc, from whatever the author called themselves. */
function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

export function ReviewCard({
  review,
  onEdit,
}: {
  review: Review;
  /** Offered only on the reader's own review. */
  onEdit?: () => void;
}) {
  const { colors, radius, spacing } = useTheme();

  return (
    <View
      style={{
        backgroundColor: review.mine ? colors.accentMuted : colors.surface,
        borderColor: review.mine ? colors.accent : colors.border,
        borderWidth: 1,
        borderRadius: radius.lg,
        padding: spacing.lg,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.full,
            backgroundColor: colors.surfaceMuted,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="label">{initialsOf(review.authorName)}</Text>
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
              {review.mine ? 'You' : review.authorName}
            </Text>
            {review.verified ? (
              // The only credential a film review has is having seen the film.
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                <Text variant="caption" tone="success">
                  Booked
                </Text>
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <RatingStars value={review.rating} size={12} />
            <Text variant="caption" tone="muted">
              {formatRelativeDay(review.createdAt)}
              {review.updatedAt !== review.createdAt ? ' · edited' : ''}
            </Text>
          </View>
        </View>

        {review.mine && onEdit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit your review"
            hitSlop={10}
            onPress={onEdit}
          >
            <Ionicons name="create-outline" size={20} color={colors.accent} />
          </Pressable>
        ) : null}
      </View>

      {review.body ? <Text>{review.body}</Text> : null}
    </View>
  );
}
