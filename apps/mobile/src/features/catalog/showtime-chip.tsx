import { describeShow, formatMoney, type ShowtimeSummary } from '@app/shared';
import { Pressable, View } from 'react-native';
import { Text } from '../../components/ui';
import { endsNextDay, formatTime } from '../../lib/format';
import { useTheme } from '../../theme';
import { AVAILABILITY_LABELS, availabilityColor, isBookable } from './availability';

/**
 * One tappable showtime. A sold-out show stays visible but inert: hiding it
 * makes the cinema look like it has fewer screenings than it does.
 *
 * A show that runs past midnight says when it ends. One in five showtimes in
 * the catalogue does, and 10:45 pm reads very differently once you know it
 * finishes at 1:35 am: the metro has stopped, the cab has surged, and work is
 * in seven hours. `endsAt` was on every showtime in the API and shown nowhere
 * in the app.
 *
 * Only for those. An afternoon show ending at 6:39 pm is arithmetic anybody
 * can do from the runtime on the film page, and printing it on every chip
 * would bury the one case that changes a decision.
 */

export function ShowtimeChip({
  showtime,
  closed = false,
  onPress,
}: {
  showtime: ShowtimeSummary;
  /**
   * Sales window already past. Decided when the list loads rather than during
   * render, and only ever to stop a chip looking bookable — the server stays
   * the authority that actually refuses a late request.
   */
  closed?: boolean;
  onPress: () => void;
}) {
  const { colors, radius, spacing } = useTheme();

  const bookable = isBookable(showtime.availability) && !closed;
  const late = endsNextDay(showtime.startsAt, showtime.endsAt);
  const accent = availabilityColor(showtime.availability, colors);
  const unavailableLabel = closed ? 'Closed' : AVAILABILITY_LABELS.SOLD_OUT;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={!bookable}
      accessibilityState={{ disabled: !bookable }}
      accessibilityLabel={`${formatTime(showtime.startsAt)}${
        late ? `, ends ${formatTime(showtime.endsAt)} the next day` : ''
      }, ${describeShow(showtime)}, ${
        bookable ? AVAILABILITY_LABELS[showtime.availability] : unavailableLabel
      }, from ${formatMoney(showtime.fromPriceMinor, showtime.currency)}`}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: 104,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        // The border is the availability signal; a dot alone is too small to
        // read at arm's length, and colour alone would fail without it.
        borderColor: bookable ? accent : colors.border,
        backgroundColor: colors.surface,
        gap: spacing.xs,
        opacity: bookable ? (pressed ? 0.7 : 1) : 0.5,
      })}
    >
      <Text variant="label" numeric style={{ color: bookable ? accent : colors.textMuted }}>
        {formatTime(showtime.startsAt)}
      </Text>
      <Text variant="caption" tone="muted">
        {describeShow(showtime)}
      </Text>
      {late ? (
        <Text variant="caption" style={{ color: colors.warning }}>
          ends {formatTime(showtime.endsAt)}
        </Text>
      ) : null}
      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 1 }} />
      <Text variant="caption" tone="muted" numeric>
        {bookable
          ? `${formatMoney(showtime.fromPriceMinor, showtime.currency)} onwards`
          : unavailableLabel}
      </Text>
    </Pressable>
  );
}
