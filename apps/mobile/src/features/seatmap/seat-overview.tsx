import type { SeatMapSeat } from '@app/shared';
import { Dimensions, Modal, Pressable, View } from 'react-native';
import { Text } from '../../components/ui';
import { useTheme } from '../../theme';
import { seatColors } from './seat-grid';
import type { SeatRenderStatus, SeatRow } from './use-seat-selection';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SHEET_PADDING = 24;
/** Thin enough that even a 62-column IMAX house fits one screen's width. */
const DOT_GAP = 1;

/**
 * The whole hall at once, small. A 34-row, 62-column house only ever shows a
 * slice of itself through the real grid's horizontal pan — this exists so a
 * person can see the shape of the room before diving into a slice of it, and
 * can tap a row to jump the real grid there rather than scrolling to find it.
 *
 * Reuses the same `rows`/`statusOf` the real grid and `findBestSeats` both
 * already consume, so there is no second idea of "where the seats are."
 */
export function SeatOverview({
  visible,
  rows,
  statusOf,
  columnCount,
  onClose,
  onJumpToRow,
}: {
  visible: boolean;
  rows: SeatRow[];
  statusOf: (seat: SeatMapSeat) => SeatRenderStatus;
  columnCount: number;
  onClose: () => void;
  onJumpToRow: (rowY: number) => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const width = Math.min(SCREEN_WIDTH, 480) - SHEET_PADDING * 2;
  const dotSize = Math.max(1.5, width / columnCount - DOT_GAP);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessible={false}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' }}
      >
        <Pressable
          accessible={false}
          onPress={() => {}}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            paddingTop: spacing.sm,
            paddingBottom: spacing.xl,
            paddingHorizontal: SHEET_PADDING,
            gap: spacing.lg,
            maxHeight: '80%',
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.borderStrong,
            }}
          />

          <View style={{ alignItems: 'center', gap: spacing.xs }}>
            <Text variant="title">The whole screen</Text>
            <Text variant="caption" tone="muted" align="center">
              Tap a row to jump the map there.
            </Text>
          </View>

          <View style={{ alignItems: 'center', gap: spacing.md }}>
            <View
              style={{
                width: width * 0.7,
                height: 3,
                borderRadius: 2,
                backgroundColor: colors.accent,
              }}
            />
            <Text variant="overline" tone="muted">
              SCREEN THIS WAY
            </Text>
          </View>

          {visible ? (
            <View style={{ gap: DOT_GAP }}>
              {rows.map((row) => (
                <Pressable
                  key={row.y}
                  accessibilityRole="button"
                  accessibilityLabel={`Jump to row ${row.label}`}
                  onPress={() => {
                    onJumpToRow(row.y);
                    onClose();
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.xs,
                    paddingVertical: 1,
                  }}
                >
                  <Text
                    variant="caption"
                    tone="muted"
                    style={{ width: 16, fontSize: 9 }}
                    numberOfLines={1}
                  >
                    {row.label}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: DOT_GAP }}>
                    {row.seats.map((seat) => {
                      const palette = seatColors(statusOf(seat), colors);
                      // An available seat's own fill is deliberately
                      // transparent in dark mode (an outline, not a block) —
                      // at dot size that would vanish, so the dot borrows its
                      // border colour instead, same green either way.
                      const dotColor =
                        palette.fill === 'transparent' ? palette.border : palette.fill;
                      return (
                        <View
                          key={seat.id}
                          style={{
                            width: dotSize,
                            height: dotSize,
                            borderRadius: dotSize / 3,
                            backgroundColor: dotColor,
                          }}
                        />
                      );
                    })}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
