import { useCallback, useEffect, useState } from 'react';
import { secureStorage } from '../../lib/storage';

const MAX_RECENT = 5;

function parse(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    // Corrupt or pre-format data is not worth failing over — start clean.
    return [];
  }
}

/**
 * A short, per-screen list of recent search terms — films and cinemas keep
 * separate lists, since "Jawan" and "Ambience Mall" are not the same kind of
 * recall. Newest first, capped at five, case-insensitive de-duplication so
 * "jawan" then "Jawan" bumps the one entry rather than doubling it.
 */
export function useRecentSearches(storageKey: string) {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void secureStorage.get(storageKey).then((raw) => {
      if (!cancelled) setRecent(parse(raw));
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const record = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      setRecent((prev) => {
        const next = [
          trimmed,
          ...prev.filter((q) => q.toLowerCase() !== trimmed.toLowerCase()),
        ].slice(0, MAX_RECENT);
        void secureStorage.set(storageKey, JSON.stringify(next));
        return next;
      });
    },
    [storageKey],
  );

  const clear = useCallback(() => {
    setRecent([]);
    void secureStorage.remove(storageKey);
  }, [storageKey]);

  return { recent, record, clear };
}
