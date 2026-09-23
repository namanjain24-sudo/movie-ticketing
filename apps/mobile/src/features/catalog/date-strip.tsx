import { Pressable, ScrollView } from 'react-native';
import { Text } from '../../components/ui';
import type { CalendarDay } from '../../lib/format';
import { useTheme } from '../../theme';

/** Horizontal day picker above a movie's showtimes. */
export function DateStrip({
  days,
  value,
  onChange,
}: {
  days: CalendarDay[];
  value: string;
  onChange: (next: string) => void;
}) {
  const { colors, radius, spacing } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
    >
      {days.map((day) => {
        const selected = day.value === value;
        return (
          <Pressable
            key={day.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={day.isToday ? 'Today' : `${day.weekday} ${day.day}`}
            onPress={() => onChange(day.value)}
            style={({ pressed }) => ({
              width: 56,
              paddingVertical: spacing.sm,
              borderRadius: radius.md,
              alignItems: 'center',
              gap: spacing['2xs'],
              backgroundColor: selected ? colors.primary : colors.surface,
              borderWidth: 1,
              borderColor: selected ? colors.primary : colors.border,
              opacity: pressed && !selected ? 0.7 : 1,
            })}
          >
            <Text
              variant="overline"
              style={{ color: selected ? colors.onPrimary : colors.textMuted }}
            >
              {day.isToday ? 'TODAY' : day.weekday.toUpperCase()}
            </Text>
            <Text
              variant="heading"
              numeric
              style={{ color: selected ? colors.onPrimary : colors.text }}
            >
              {day.day}
            </Text>
            <Text
              variant="overline"
              style={{ color: selected ? colors.onPrimary : colors.textMuted }}
            >
              {day.month.toUpperCase()}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
