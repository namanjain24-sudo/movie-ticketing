import { View } from 'react-native';
import { Text } from '../../components/ui';
import { useTheme } from '../../theme';
import { seatColors } from './seat-grid';
import type { SeatRenderStatus } from './use-seat-selection';

const ENTRIES: { status: SeatRenderStatus; label: string }[] = [
  { status: 'AVAILABLE', label: 'Available' },
  { status: 'SELECTED', label: 'Selected' },
  { status: 'HELD_BY_YOU', label: 'Yours' },
  { status: 'SOLD', label: 'Taken' },
];

export function SeatLegend() {
  const { colors, radius, spacing } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: spacing.lg,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: colors.border,
      }}
    >
      {ENTRIES.map(({ status, label }) => {
        const palette = seatColors(status, colors);
        return (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <View
              style={{
                width: 13,
                height: 13,
                borderTopLeftRadius: radius.sm,
                borderTopRightRadius: radius.sm,
                borderBottomLeftRadius: 2,
                borderBottomRightRadius: 2,
                borderWidth: 1,
                borderColor: palette.border,
                backgroundColor: palette.fill,
              }}
            />
            <Text variant="caption" tone="muted">
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
