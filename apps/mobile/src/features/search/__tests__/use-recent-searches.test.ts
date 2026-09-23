import { act, renderHook, waitFor } from '@testing-library/react-native';
import { secureStorage } from '../../../lib/storage';
import { useRecentSearches } from '../use-recent-searches';

jest.mock('../../../lib/storage', () => {
  const store = new Map<string, string>();
  return {
    STORAGE_KEYS: { recentFilmSearches: 'search.recentFilms' },
    secureStorage: {
      get: jest.fn(async (k: string) => store.get(k) ?? null),
      set: jest.fn(async (k: string, v: string) => void store.set(k, v)),
      remove: jest.fn(async (k: string) => void store.delete(k)),
    },
  };
});

const KEY = 'search.recentFilms';

beforeEach(async () => {
  jest.clearAllMocks();
  await secureStorage.remove(KEY);
});

describe('useRecentSearches', () => {
  it('starts empty with nothing stored', async () => {
    const { result } = await renderHook(() => useRecentSearches(KEY));
    await waitFor(() => expect(result.current.recent).toEqual([]));
  });

  it('records a query, newest first', async () => {
    const { result } = await renderHook(() => useRecentSearches(KEY));
    await waitFor(() => expect(result.current.recent).toEqual([]));

    await act(async () => result.current.record('Jawan'));
    expect(result.current.recent).toEqual(['Jawan']);

    await act(async () => result.current.record('Pathaan'));
    expect(result.current.recent).toEqual(['Pathaan', 'Jawan']);
  });

  it('bumps a repeated query to the front instead of duplicating it, case-insensitively', async () => {
    const { result } = await renderHook(() => useRecentSearches(KEY));
    await waitFor(() => expect(result.current.recent).toEqual([]));

    await act(async () => result.current.record('Jawan'));
    await act(async () => result.current.record('Pathaan'));
    await act(async () => result.current.record('jawan'));

    expect(result.current.recent).toEqual(['jawan', 'Pathaan']);
  });

  it('ignores a blank query', async () => {
    const { result } = await renderHook(() => useRecentSearches(KEY));
    await waitFor(() => expect(result.current.recent).toEqual([]));

    await act(async () => result.current.record('   '));
    expect(result.current.recent).toEqual([]);
  });

  it('caps the list at five, dropping the oldest', async () => {
    const { result } = await renderHook(() => useRecentSearches(KEY));
    await waitFor(() => expect(result.current.recent).toEqual([]));

    for (const title of ['A', 'B', 'C', 'D', 'E', 'F']) {
      await act(async () => result.current.record(title));
    }

    expect(result.current.recent).toEqual(['F', 'E', 'D', 'C', 'B']);
  });

  it('persists what it records, so a later mount reading the same key sees it', async () => {
    const { result } = await renderHook(() => useRecentSearches(KEY));
    await waitFor(() => expect(result.current.recent).toEqual([]));
    await act(async () => result.current.record('Jawan'));

    expect(await secureStorage.get(KEY)).toBe(JSON.stringify(['Jawan']));
  });

  it('clears the list and the persisted value', async () => {
    const { result } = await renderHook(() => useRecentSearches(KEY));
    await waitFor(() => expect(result.current.recent).toEqual([]));
    await act(async () => result.current.record('Jawan'));
    expect(result.current.recent).toEqual(['Jawan']);

    await act(async () => result.current.clear());
    expect(result.current.recent).toEqual([]);
    expect(await secureStorage.get(KEY)).toBeNull();
  });
});
