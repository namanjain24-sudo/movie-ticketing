import type { SeatMap, SeatMapSeat } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import { Text } from '../../components/ui';
import { AnimatedPressable, usePressScale } from '../../lib/use-press-scale';
import { useTheme } from '../../theme';
import { NUMERIC } from '../../theme/tokens';
import type { SeatRenderStatus, SeatRow } from './use-seat-selection';

/**
 * Finds the wheelchair spaces.
 *
 * There are 198 of them across the whole catalogue against 24,316 ordinary
 * seats — about one in a hundred and twenty. The map drew them correctly and
 * gave no way to reach them: the only route to the two spaces in a
 * three-hundred-seat room was to scroll the room looking for an icon, which
 * is the worst version of this screen handed to the person with the least
 * room to manoeuvre.
 *
 * Shown only when the room has them. A control that says "0 wheelchair
 * spaces" on every cinema without any is noise everywhere and a promise
 * nowhere, and a room genuinely without them should say so on the venue page,
 * not here.
 */
export function AccessibleSeats({
  rows,
  seats,
  statusOf,
  onJump,
}: {
  rows: SeatRow[];
  seats: SeatMap['seats'];
  statusOf: (seat: SeatMapSeat) => SeatRenderStatus;
  /** Scrolls the seat list to a row's `y`. */
  onJump: (rowY: number) => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const press = usePressScale();

  const total = seats.filter((s) => s.accessible).length;
  if (total === 0) return null;

  const free = seats.filter(
    (s) => s.accessible && ['AVAILABLE', 'HELD_BY_YOU'].includes(statusOf(s)),
  ).length;

  // The first row that still has one open, so the jump lands somewhere
  // useful rather than on a row of spaces already taken.
  const target =
    rows.find((r) =>
      r.seats.some((s) => s.accessible && ['AVAILABLE', 'HELD_BY_YOU'].includes(statusOf(s))),
    ) ?? rows.find((r) => r.seats.some((s) => s.accessible));

  const soldOut = free === 0;

  return (
    <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
      <AnimatedPressable
        accessibilityRole="button"
        disabled={!target}
        accessibilityLabel={
          soldOut
            ? `All ${total} wheelchair spaces in this room are taken`
            : `${free} of ${total} wheelchair spaces free. Show them on the map.`
        }
        onPressIn={target ? press.onPressIn : undefined}
        onPressOut={press.onPressOut}
        onPress={target ? () => onJump(target.y) : undefined}
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            alignSelf: 'flex-start',
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
            borderRadius: radius.full,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            opacity: soldOut ? 0.6 : 1,
          },
          press.style,
        ]}
      >
        <Ionicons
          name="accessibility-outline"
          size={16}
          color={soldOut ? colors.textMuted : colors.text}
        />
        <Text variant="caption" tone={soldOut ? 'muted' : 'default'} style={NUMERIC}>
          {soldOut
            ? `Wheelchair spaces taken`
            : `${free} wheelchair ${free === 1 ? 'space' : 'spaces'}`}
        </Text>
        {soldOut ? null : (
          <Text variant="caption" tone="muted">
            · Show me
          </Text>
        )}
      </AnimatedPressable>
    </View>
  );
}
