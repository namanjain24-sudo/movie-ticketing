import { Pressable, ScrollView } from 'react-native';
import { Text } from '../../components/ui';
import { useTheme } from '../../theme';

const ALL = 'All cities';

/** Horizontal city chips. `undefined` means every city. */
export function CityFilter({
  cities,
  value,
  onChange,
}: {
  cities: string[];
  value?: string;
  onChange: (next?: string) => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const options: (string | undefined)[] = [undefined, ...cities];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
    >
      {options.map((city) => {
        const selected = city === value;
        return (
          <Pressable
            key={city ?? ALL}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(city)}
            style={({ pressed }) => ({
              paddingVertical: spacing.xs + 2,
              paddingHorizontal: spacing.md,
              borderRadius: radius.full,
              borderWidth: 1,
              backgroundColor: selected ? colors.primary : colors.surface,
              borderColor: selected ? colors.primary : colors.border,
              opacity: pressed && !selected ? 0.7 : 1,
            })}
          >
            <Text variant="caption" style={{ color: selected ? colors.onPrimary : colors.text }}>
              {city ?? ALL}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
