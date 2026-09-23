import type { MovieSummary } from '@app/shared';
import { Pressable, ScrollView } from 'react-native';
import { Text } from '../../components/ui';
import { tapFeedback } from '../../lib/haptics';
import { useTheme } from '../../theme';

/** Genres the current list actually contains, most common first. */
export function genresIn(movies: MovieSummary[]): string[] {
  const counts = new Map<string, number>();
  for (const movie of movies) {
    for (const genre of movie.genres) counts.set(genre, (counts.get(genre) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([genre]) => genre);
}

export function byGenre(movies: MovieSummary[], genre?: string): MovieSummary[] {
  return genre ? movies.filter((m) => m.genres.includes(genre)) : movies;
}

/** Languages the current list actually contains, most common first. */
export function languagesIn(movies: MovieSummary[]): string[] {
  const counts = new Map<string, number>();
  for (const movie of movies) {
    for (const language of movie.languages) {
      counts.set(language, (counts.get(language) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([language]) => language);
}

export function byLanguage(movies: MovieSummary[], language?: string): MovieSummary[] {
  return language ? movies.filter((m) => m.languages.includes(language)) : movies;
}

/** A single-choice chip row. Used for genres and for languages. */
export function GenreFilter({
  genres,
  value,
  onChange,
  allLabel = 'All genres',
}: {
  genres: string[];
  value?: string;
  onChange: (next?: string) => void;
  allLabel?: string;
}) {
  const { colors, radius, spacing } = useTheme();

  // One genre is not a choice, it is a label.
  if (genres.length < 2) return null;

  const chip = (label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={label}
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
        backgroundColor: selected ? colors.text : colors.surface,
        borderColor: selected ? colors.text : colors.border,
        opacity: pressed && !selected ? 0.7 : 1,
      })}
    >
      <Text variant="caption" style={{ color: selected ? colors.background : colors.text }}>
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
      {chip(allLabel, !value, () => onChange(undefined))}
      {genres.map((genre) => chip(genre, value === genre, () => onChange(genre)))}
    </ScrollView>
  );
}
