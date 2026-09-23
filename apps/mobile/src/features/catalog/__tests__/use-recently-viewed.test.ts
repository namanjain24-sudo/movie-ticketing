import type { MovieSummary } from '@app/shared';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { secureStorage } from '../../../lib/storage';
import { useRecentlyViewed } from '../use-recently-viewed';

jest.mock('../../../lib/storage', () => {
  const store = new Map<string, string>();
  return {
    STORAGE_KEYS: { recentlyViewedFilms: 'catalog.recentlyViewed' },
    secureStorage: {
      get: jest.fn(async (k: string) => store.get(k) ?? null),
      set: jest.fn(async (k: string, v: string) => void store.set(k, v)),
      remove: jest.fn(async (k: string) => void store.delete(k)),
    },
  };
});

// The real hook re-reads on navigation focus; a mount is the one focus event
// every test here actually needs, so the mock collapses to that.
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(effect, []);
  },
}));

const KEY = 'catalog.recentlyViewed';

function film(id: string): MovieSummary {
  return {
    id,
    slug: id,
    title: id,
    posterUrl: '',
    durationMins: 100,
    certification: 'UA',
    languages: ['Hindi'],
    genres: ['Action'],
    releaseDate: '2026-01-01T00:00:00.000Z',
    rating: { average: null, count: 0 },
    isNowShowing: true,
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await secureStorage.remove(KEY);
});

describe('useRecentlyViewed', () => {
  it('starts empty with nothing stored', async () => {
    const { result } = await renderHook(() => useRecentlyViewed());
    await waitFor(() => expect(result.current.movies).toEqual([]));
  });

  it('records a film, newest first', async () => {
    const { result } = await renderHook(() => useRecentlyViewed());
    await waitFor(() => expect(result.current.movies).toEqual([]));

    await act(async () => result.current.record(film('jawan')));
    expect(result.current.movies.map((m) => m.id)).toEqual(['jawan']);

    await act(async () => result.current.record(film('pathaan')));
    expect(result.current.movies.map((m) => m.id)).toEqual(['pathaan', 'jawan']);
  });

  it('bumps a re-viewed film to the front instead of duplicating it', async () => {
    const { result } = await renderHook(() => useRecentlyViewed());
    await waitFor(() => expect(result.current.movies).toEqual([]));

    await act(async () => result.current.record(film('jawan')));
    await act(async () => result.current.record(film('pathaan')));
    await act(async () => result.current.record(film('jawan')));

    expect(result.current.movies.map((m) => m.id)).toEqual(['jawan', 'pathaan']);
  });

  it('caps the list at twelve, dropping the oldest', async () => {
    const { result } = await renderHook(() => useRecentlyViewed());
    await waitFor(() => expect(result.current.movies).toEqual([]));

    for (let i = 0; i < 13; i++) {
      await act(async () => result.current.record(film(`m${i}`)));
    }

    expect(result.current.movies).toHaveLength(12);
    expect(result.current.movies[0]?.id).toBe('m12');
    expect(result.current.movies.map((m) => m.id)).not.toContain('m0');
  });

  it('persists what it records, so a later mount reading the same key sees it', async () => {
    const { result } = await renderHook(() => useRecentlyViewed());
    await waitFor(() => expect(result.current.movies).toEqual([]));
    await act(async () => result.current.record(film('jawan')));

    const { result: second } = await renderHook(() => useRecentlyViewed());
    await waitFor(() => expect(second.current.movies.map((m) => m.id)).toEqual(['jawan']));
  });
});
