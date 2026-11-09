import { formatMoney } from '@app/shared';
import { Pressable, ScrollView } from 'react-native';
import { Text } from '../../components/ui';
import { tapFeedback } from '../../lib/haptics';
import { useTheme } from '../../theme';
import { SHOWTIME_ORDERS, type ShowtimeOrder } from './ordering';

/**
 * How to arrange a film's cinemas.
 *
 * A sort rather than a filter, so there is no "all" chip: the list is always
 * in some order, and the question is which one. That is why this is not
 * `GenreFilter`, which always offers an "everything" option because a filter
 * can genuinely be off.
 *
 * `cheapest` carries the actual lowest price on the chip. It is the reason
 * this control exists - the same film at the same time is routinely 150
 * rupees at one multiplex and 400 at another - and a sort option that says
 * what it will find is worth more than one that only says what it does.
 */
export function ShowtimeOrderPicker({
  value,
  onChange,
  cheapestMinor,
  currency,
}: {
  value: ShowtimeOrder;
  onChange: (next: ShowtimeOrder) => void;
  /** The lowest price in the list, shown on the cheapest chip. */
  cheapestMinor: number | null;
  currency: string;
}) {
  const { colors, radius, spacing } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
    >
      {SHOWTIME_ORDERS.map((option) => {
        const selected = option.id === value;
        const label =
          option.id === 'cheapest' && cheapestMinor !== null
            ? `${option.label} · ${formatMoney(cheapestMinor, currency)}`
            : option.label;

        return (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) tapFeedback();
              onChange(option.id);
            }}
            style={({ pressed }) => ({
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.lg,
              borderRadius: radius.full,
              backgroundColor: selected ? colors.primarySolid : colors.surfaceMuted,
              opacity: pressed && !selected ? 0.7 : 1,
            })}
          >
            <Text
              variant="label"
              numeric
              style={{ color: selected ? colors.onPrimary : colors.text }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
