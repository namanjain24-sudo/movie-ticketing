import {
  EVENT_KIND_SINGULAR,
  EVENT_ORGANISER_LABELS,
  formatMoney,
  type EventSummary,
} from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';
import { Badge, Poster, Text } from '../../components/ui';
import { formatMonthDay, formatTime } from '../../lib/format';
import { useTheme } from '../../theme';

/**
 * One event in a list.
 *
 * Shaped around the two questions somebody scanning a list is actually
 * asking — when, and how much — rather than around the poster. A film card
 * can lead with artwork because the title is the whole product; a fixture
 * cannot, because "Mumbai Indians vs Chennai Super Kings on Saturday at
 * Wankhede, from ₹1,200" is four facts and the poster is none of them.
 */
export function EventCard({ event, onPress }: { event: EventSummary; onPress: () => void }) {
  const { colors, radius, spacing } = useTheme();

  const when = event.nextShowAt
    ? `${formatMonthDay(event.nextShowAt)} · ${formatTime(event.nextShowAt)}`
    : null;

  const where = event.venue
    ? event.cityCount > 1
      ? `${event.venue.city} and ${event.cityCount - 1} more`
      : `${event.venue.name}, ${event.venue.city}`
    : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        `${event.title}. ${EVENT_KIND_SINGULAR[event.kind]}. ` +
        (when ? `Next on ${when}. ` : 'No dates on sale. ') +
        (event.fromPriceMinor ? `From ${formatMoney(event.fromPriceMinor, 'INR')}.` : '')
      }
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
      })}
    >
      <Poster
        uri={event.posterUrl}
        title={event.title}
        rounded={radius.md}
        style={{ width: 68, aspectRatio: 3 / 4 }}
      />

      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Badge label={EVENT_KIND_SINGULAR[event.kind]} tone="primary" />
          {event.minAge ? <Badge label={`${event.minAge}+`} variant="outline" /> : null}
        </View>

        <Text variant="label" numberOfLines={2}>
          {event.title}
        </Text>

        {/* The line-up or the tournament, whichever this kind has. */}
        {event.organiser ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {EVENT_ORGANISER_LABELS[event.kind]}: {event.organiser}
          </Text>
        ) : null}

        {when ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
            <Text variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
              {when}
            </Text>
          </View>
        ) : (
          <Text variant="caption" tone="muted">
            No dates on sale
          </Text>
        )}

        {where ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="location-outline" size={12} color={colors.textMuted} />
            <Text variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
              {where}
            </Text>
          </View>
        ) : null}

        {event.fromPriceMinor !== null ? (
          <Text variant="label" numeric style={{ color: colors.primary, marginTop: 2 }}>
            from {formatMoney(event.fromPriceMinor, 'INR')}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
