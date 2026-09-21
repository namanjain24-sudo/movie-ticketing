import { SHOW_FORMAT_LABELS, type ShowtimeSummary, type ShowFormat } from '@app/shared';
import { Pressable, ScrollView } from 'react-native';
import { Text } from '../../components/ui';
import { useTheme } from '../../theme';

export type ShowtimeFilter = { format?: ShowFormat; language?: string };

/**
 * Generic over the showtime element so callers keep whatever they annotated it
 * with — the movie screen tags each slot as `closed`, and narrowing to the bare
 * wire type here would quietly throw that away.
 */
type Grouped<T> = { showtimes: T[] };

/** What this day actually offers. Never a fixed list of every format we know. */
export function filterOptions<T extends ShowtimeSummary>(cinemas: Grouped<T>[]) {
  const formats = new Set<ShowFormat>();
  const languages = new Set<string>();
  for (const entry of cinemas) {
    for (const slot of entry.showtimes) {
      formats.add(slot.format);
      languages.add(slot.language);
    }
  }
  return { formats: [...formats], languages: [...languages] };
}

export function applyFilter<T extends ShowtimeSummary, G extends Grouped<T>>(
  cinemas: G[],
  filter: ShowtimeFilter,
): G[] {
  if (!filter.format && !filter.language) return cinemas;
  return (
    cinemas
      .map((entry) => ({
        ...entry,
        showtimes: entry.showtimes.filter(
          (slot) =>
            (!filter.format || slot.format === filter.format) &&
            (!filter.language || slot.language === filter.language),
        ),
      }))
      // A cinema with nothing left is noise, not information.
      .filter((entry) => entry.showtimes.length > 0)
  );
}

export function ShowtimeFilters({
  formats,
  languages,
  value,
  onChange,
}: {
  formats: ShowFormat[];
  languages: string[];
  value: ShowtimeFilter;
  onChange: (next: ShowtimeFilter) => void;
}) {
  const { colors, radius, spacing } = useTheme();

  // With a single option there is nothing to choose between.
  if (formats.length < 2 && languages.length < 2) return null;

  const chip = (label: string, selected: boolean, onPress: () => void, key: string) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
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
        {label}
      </Text>
    </Pressable>
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
    >
      {chip('All', !value.format && !value.language, () => onChange({}), 'all')}
      {formats.length > 1 &&
        formats.map((format) =>
          chip(
            SHOW_FORMAT_LABELS[format],
            value.format === format,
            () => onChange({ ...value, format: value.format === format ? undefined : format }),
            `f-${format}`,
          ),
        )}
      {languages.length > 1 &&
        languages.map((language) =>
          chip(
            language,
            value.language === language,
            () =>
              onChange({ ...value, language: value.language === language ? undefined : language }),
            `l-${language}`,
          ),
        )}
    </ScrollView>
  );
}
