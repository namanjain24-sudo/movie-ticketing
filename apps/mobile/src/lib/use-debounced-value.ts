import { useEffect, useState } from 'react';

/**
 * Holds back a fast-changing value until it settles.
 *
 * Built for search-as-you-type: feeding `search` straight into a query key
 * means every keystroke is a queryKey react-query has never seen, so
 * `isPending` goes true again on each one — and a screen that swaps its whole
 * list for a skeleton while pending unmounts the input that is still focused,
 * which drops whatever the user types next. Debouncing the value the query
 * key is built from keeps the input mounted and cuts a request per keystroke
 * down to one per pause.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
