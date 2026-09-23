import { SHOW_FORMAT_LABELS, formatMoney, type Booking } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import { Badge, Poster, Text } from '../../components/ui';
import { formatMonthDay, formatTime } from '../../lib/format';
import { tapFeedback } from '../../lib/haptics';
import { AnimatedPressable, usePressScale } from '../../lib/use-press-scale';
import { useTheme } from '../../theme';

/**
 * One booking in the list. The seats and the reference are what a person
 * actually needs at the door, so they outrank everything except the film.
 */
export function BookingCard({ booking, onPress }: { booking: Booking; onPress: () => void }) {
  const { colors, radius, spacing, elevation } = useTheme();
  const { showtime } = booking;
  const cancelled = booking.status === 'CANCELLED' || booking.status === 'FAILED';
  const press = usePressScale();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`${showtime.movie.title}, ${formatMonthDay(
        showtime.startsAt,
      )} at ${formatTime(showtime.startsAt)}, seats ${booking.seats
        .map((s) => `${s.rowLabel}${s.number}`)
        .join(', ')}. Reference ${booking.reference}`}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        {
          flexDirection: 'row',
          gap: spacing.md,
          padding: spacing.md,
          borderRadius: radius.lg,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          opacity: cancelled ? 0.6 : 1,
        },
        elevation.card,
        press.style,
      ]}
    >
      <Poster
        uri={showtime.movie.posterUrl}
        title={showtime.movie.title}
        rounded={radius.md}
        style={{ width: 64, aspectRatio: 2 / 3 }}
      />

      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>
            {showtime.movie.title}
          </Text>
          {cancelled ? <Badge label={booking.status} tone="neutral" /> : null}
        </View>

        <Text variant="caption" tone="muted" numberOfLines={1}>
          {showtime.cinema.name} · {showtime.screen.name}
        </Text>
        <Text variant="caption" tone="muted" numeric>
          {formatMonthDay(showtime.startsAt)} · {formatTime(showtime.startsAt)} ·{' '}
          {SHOW_FORMAT_LABELS[showtime.format]}
        </Text>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            marginTop: spacing.xs,
          }}
        >
          <Ionicons name="ticket-outline" size={13} color={colors.textMuted} />
          <Text variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
            {booking.seats.map((s) => `${s.rowLabel}${s.number}`).join(', ')}
          </Text>
          <Text variant="caption" numeric>
            {formatMoney(booking.totalMinor, booking.currency)}
          </Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}
