import { SHOW_FORMAT_LABELS, formatMoney, type Booking } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation } from '@tanstack/react-query';
import { useRef } from 'react';
import { ActivityIndicator, Share, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SharedValue } from 'react-native-reanimated';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { Badge, Poster, Text } from '../../components/ui';
import { addShowtimeToCalendar } from '../../lib/calendar';
import { formatMonthDay, formatTime } from '../../lib/format';
import { tapFeedback } from '../../lib/haptics';
import { notify } from '../../lib/notify';
import { shareLink } from '../../lib/share-link';
import { AnimatedPressable, usePressScale } from '../../lib/use-press-scale';
import { useTheme } from '../../theme';

const ACTION_WIDTH = 68;

/**
 * One booking in the list. The seats and the reference are what a person
 * actually needs at the door, so they outrank everything except the film.
 *
 * Upcoming bookings swipe open onto two shortcuts — calendar and share —
 * for the two things someone reaches for from this list specifically, without
 * opening the ticket first. Cancelled bookings have nothing left to shortcut
 * to, so they stay a plain row.
 */
export function BookingCard({ booking, onPress }: { booking: Booking; onPress: () => void }) {
  const { colors, radius, spacing, elevation } = useTheme();
  const { showtime } = booking;
  const cancelled = booking.status === 'CANCELLED' || booking.status === 'FAILED';
  const press = usePressScale();
  const swipeRef = useRef<SwipeableMethods>(null);

  const addToCalendar = useMutation({
    mutationFn: () => addShowtimeToCalendar(booking),
    onSuccess: (result) => {
      swipeRef.current?.close();
      if (result === 'added') {
        notify('Added to calendar', `${showtime.movie.title} is on your calendar.`);
      } else if (result === 'permission-denied') {
        notify('No calendar access', 'Allow calendar access in Settings to add this showtime.');
      } else if (result === 'unsupported') {
        notify('Not available', 'Adding to the calendar is not supported on this device.');
      } else {
        notify('Could not add to calendar', 'Please try again in a moment.');
      }
    },
  });

  const card = (
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

  if (cancelled) return card;

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={2}
      rightThreshold={ACTION_WIDTH}
      overshootRight={false}
      renderRightActions={(progress) => (
        <SwipeActions
          progress={progress}
          onCalendar={() => {
            tapFeedback();
            addToCalendar.mutate();
          }}
          calendarBusy={addToCalendar.isPending}
          onShare={() => {
            tapFeedback();
            swipeRef.current?.close();
            void Share.share({
              message:
                `${showtime.movie.title} · ${formatMonthDay(showtime.startsAt)}, ` +
                `${formatTime(showtime.startsAt)}\n${showtime.cinema.name}, ${showtime.screen.name}\n` +
                `Seats ${booking.seats.map((s) => `${s.rowLabel}${s.number}`).join(', ')}\n` +
                `Booking ${booking.reference}\n${shareLink(`/booking/${booking.reference}`)}`,
            });
          }}
        />
      )}
    >
      {card}
    </ReanimatedSwipeable>
  );
}

/**
 * Fades and slides in with the swipe rather than snapping into place at the
 * threshold — `progress` goes from 0 (closed) to 1 (open), so the actions
 * arrive over the same gesture that reveals them instead of after it.
 */
function SwipeActions({
  progress,
  onCalendar,
  calendarBusy,
  onShare,
}: {
  progress: SharedValue<number>;
  onCalendar: () => void;
  calendarBusy: boolean;
  onShare: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.85 + Math.min(progress.value, 1) * 0.15 }],
  }));

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.sm }}>
      <Animated.View style={[{ flexDirection: 'row', gap: spacing.sm }, style]}>
        <SwipeAction
          icon="calendar-outline"
          label="Calendar"
          onPress={onCalendar}
          busy={calendarBusy}
          background={colors.accentMuted}
          tint={colors.accent}
          radius={radius.lg}
        />
        <SwipeAction
          icon="share-outline"
          label="Share"
          onPress={onShare}
          background={colors.surfaceMuted}
          tint={colors.textMuted}
          radius={radius.lg}
        />
      </Animated.View>
    </View>
  );
}

function SwipeAction({
  icon,
  label,
  onPress,
  busy = false,
  background,
  tint,
  radius,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  busy?: boolean;
  background: string;
  tint: string;
  radius: number;
}) {
  const { spacing } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={busy}
      style={{
        width: ACTION_WIDTH,
        height: '100%',
        borderRadius: radius,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing['2xs'],
        backgroundColor: background,
      }}
    >
      {busy ? (
        <ActivityIndicator size="small" color={tint} />
      ) : (
        <Ionicons name={icon} size={20} color={tint} />
      )}
      <Text variant="caption" style={{ color: tint }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}
