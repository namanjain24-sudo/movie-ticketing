import { SHOW_FORMAT_LABELS, type ShowtimeSummary, type ShowFormat } from '@app/shared';
import { Pressable, ScrollView } from 'react-native';
import { Text } from '../../components/ui';
import { tapFeedback } from '../../lib/haptics';
import { useTheme } from '../../theme';

export type ShowtimeFilter = { format?: ShowFormat; language?: string; partOfDay?: PartOfDay };

/**
 * When a show starts, in the words people use when they are deciding whether
 * they can go. A format and a language narrow *what* is playing; this narrows
 * *when*, which is the constraint most people actually arrive with — and the
 * one a multiplex with four screens makes hardest to scan by eye.
 *
 * Boundaries are the ordinary ones: lunchtime, the end of a working day, and
 * late enough that getting home is a consideration.
 */
export const PARTS_OF_DAY = [
  { id: 'morning', label: 'Morning', from: 0, until: 12 },
  { id: 'afternoon', label: 'Afternoon', from: 12, until: 17 },
  { id: 'evening', label: 'Evening', from: 17, until: 21 },
  { id: 'night', label: 'Night', from: 21, until: 24 },
] as const;

export type PartOfDay = (typeof PARTS_OF_DAY)[number]['id'];

/**
 * Local hours, not UTC: the question is what time it is where the cinema is,
 * and the list beside this prints local times too. Reading these apart is how
 * a 10:15 pm show ends up filed under Morning.
 */
export function partOfDay(startsAt: string): PartOfDay {
  const hour = new Date(startsAt).getHours();
  return (PARTS_OF_DAY.find((p) => hour >= p.from && hour < p.until) ?? PARTS_OF_DAY[0]).id;
}

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
  const parts = new Set<PartOfDay>();
  for (const entry of cinemas) {
    for (const slot of entry.showtimes) {
      formats.add(slot.format);
      languages.add(slot.language);
      parts.add(partOfDay(slot.startsAt));
    }
  }
  return {
    formats: [...formats],
    languages: [...languages],
    // In the order of the day rather than the order they were found, so the
    // chips read Morning, Afternoon, Evening, Night however the list arrived.
    parts: PARTS_OF_DAY.filter((p) => parts.has(p.id)),
  };
}

export function applyFilter<T extends ShowtimeSummary, G extends Grouped<T>>(
  cinemas: G[],
  filter: ShowtimeFilter,
): G[] {
  if (!filter.format && !filter.language && !filter.partOfDay) return cinemas;
  return (
    cinemas
      .map((entry) => ({
        ...entry,
        showtimes: entry.showtimes.filter(
          (slot) =>
            (!filter.format || slot.format === filter.format) &&
            (!filter.language || slot.language === filter.language) &&
            (!filter.partOfDay || partOfDay(slot.startsAt) === filter.partOfDay),
        ),
      }))
      // A cinema with nothing left is noise, not information.
      .filter((entry) => entry.showtimes.length > 0)
  );
}

export function ShowtimeFilters({
  formats,
  languages,
  parts = [],
  value,
  onChange,
}: {
  formats: ShowFormat[];
  languages: string[];
  parts?: readonly (typeof PARTS_OF_DAY)[number][];
  value: ShowtimeFilter;
  onChange: (next: ShowtimeFilter) => void;
}) {
  const { colors, radius, spacing } = useTheme();

  // With a single option there is nothing to choose between.
  if (formats.length < 2 && languages.length < 2 && parts.length < 2) return null;

  const chip = (label: string, selected: boolean, onPress: () => void, key: string) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        if (!selected) tapFeedback();
        onPress();
      }}
      style={({ pressed }) => ({
        paddingVertical: spacing.xs + 2,
        paddingHorizontal: spacing.md,
        borderRadius: radius.full,
        borderWidth: 1,
        backgroundColor: selected ? colors.primarySolid : colors.surface,
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
      {chip('All', !value.format && !value.language && !value.partOfDay, () => onChange({}), 'all')}
      {/* When comes first: it is the constraint most people arrive with, and
          the one a four-screen multiplex makes hardest to scan by eye. */}
      {parts.length > 1 &&
        parts.map((part) =>
          chip(
            part.label,
            value.partOfDay === part.id,
            () =>
              onChange({
                ...value,
                partOfDay: value.partOfDay === part.id ? undefined : part.id,
              }),
            `p-${part.id}`,
          ),
        )}
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
