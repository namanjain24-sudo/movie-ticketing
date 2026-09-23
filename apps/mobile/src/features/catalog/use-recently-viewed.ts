import type { MovieSummary } from '@app/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { secureStorage, STORAGE_KEYS } from '../../lib/storage';

const MAX_RECENT = 12;

function parse(raw: string | null): MovieSummary[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as MovieSummary[]) : [];
  } catch {
    // Corrupt or pre-format data is not worth failing over — start clean.
    return [];
  }
}

/**
 * Films opened anywhere in the app, newest first, capped at twelve. Stored as
 * full summaries rather than ids, so the home rail renders without a second
 * round trip and survives a film leaving the on-sale list after the visit.
 *
 * The read side re-reads on focus rather than once on mount: the record
 * happens on a different screen (the film page), which this hook's home-tab
 * instance has no other way to hear about.
 */
export function useRecentlyViewed() {
  const [movies, setMovies] = useState<MovieSummary[]>([]);

  const reload = useCallback(() => {
    void secureStorage.get(STORAGE_KEYS.recentlyViewedFilms).then((raw) => setMovies(parse(raw)));
  }, []);

  useFocusEffect(reload);

  const record = useCallback((movie: MovieSummary) => {
    setMovies((prev) => {
      const next = [movie, ...prev.filter((m) => m.id !== movie.id)].slice(0, MAX_RECENT);
      void secureStorage.set(STORAGE_KEYS.recentlyViewedFilms, JSON.stringify(next));
      return next;
    });
  }, []);

  return { movies, record };
}
