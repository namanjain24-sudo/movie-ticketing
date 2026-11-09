import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';

/**
 * Last night's catalogue, kept on disk so the app opens with something in it.
 *
 * Two real problems, one answer. Patchy mobile data means the film list fails
 * to load on a train; and the demo API sleeps on its free plan, so the first
 * open after an idle spell waits the better part of a minute for a server to
 * start - measured at 55 seconds, and once at 95 before a 500. Both of those
 * are a blank screen today. Neither needs to be: the catalogue barely changes
 * hour to hour, and the copy from last time is a far better thing to show
 * than a spinner.
 *
 * It is a cache, not a store. It lives in `Paths.cache`, which the OS may
 * clear whenever it wants, and every read and write is allowed to fail
 * without anybody hearing about it. React Query still refetches on mount, so
 * this only ever changes what is on screen *while* that happens.
 */

/**
 * The only query keys that may be written to disk.
 *
 * An allowlist, not a denylist, and the reason is privacy rather than size.
 * The query cache also holds this account's bookings, its loyalty balance, its
 * saved films and its profile. The ticket vault deliberately keeps confirmed
 * tickets in `expo-secure-store`, which is encrypted; a blanket cache
 * persister would quietly copy the same sort of data into a plain file in the
 * cache directory and undo that decision.
 *
 * So the rule is stated as the short list of things that are true for
 * everybody, and anything new is excluded until somebody adds it here on
 * purpose. `seatmap` is public and still excluded: it is the largest payload
 * in the product and it is wrong within seconds.
 */
const PUBLIC_KEYS = new Set([
  'movies',
  'movie',
  'cities',
  'coming-soon',
  'cinemas',
  'cinema',
  'cinema-brands',
  'events',
  'event',
  'event-cities',
  'event-shows',
  'promo-offers',
  'reviews',
]);

/** Whether one query's key names something safe to keep on disk. */
export function isPublicQueryKey(key: readonly unknown[]): boolean {
  const head = key[0];
  return typeof head === 'string' && PUBLIC_KEYS.has(head);
}

/**
 * How much of it to keep.
 *
 * The film grid for a city is a couple of kilobytes, so this is generous for
 * what it is meant to hold and still small enough that a corrupt or runaway
 * file cannot become the reason the app is slow to start. Past it, the
 * snapshot is dropped rather than trimmed: half a catalogue written in an
 * order nobody chose is not a better answer than none.
 */
const MAX_BYTES = 512 * 1024;

const FILE_NAME = 'catalogue-snapshot.json';

function snapshotFile(): File {
  return new File(Paths.cache, FILE_NAME);
}

/**
 * Writes the public half of the cache out. Never throws.
 *
 * `shouldDehydrateQuery` also drops anything that has not successfully
 * resolved: an errored or still-pending query has nothing worth keeping, and
 * restoring a rejected promise's state would hand the next launch an error it
 * then has to clear.
 */
export async function saveCatalogueSnapshot(client: QueryClient): Promise<void> {
  try {
    const state = dehydrate(client, {
      shouldDehydrateQuery: (query) =>
        query.state.status === 'success' && isPublicQueryKey(query.queryKey),
      shouldDehydrateMutation: () => false,
    });
    if (state.queries.length === 0) return;

    const json = JSON.stringify(state);
    // Checked before the write, not after: the point is to never put a file
    // that large on the device in the first place.
    if (json.length > MAX_BYTES) return;
    snapshotFile().write(json);
  } catch {
    // A full disk, a cleared cache directory, an unserialisable value. None
    // of them is worth telling anybody about: the app works without this.
  }
}

/**
 * Seeds the cache from disk. Never throws, and answers whether it found
 * anything so a caller can tell "restored" from "nothing to restore".
 *
 * Filtered again on the way in. The file is the app's own, but it is a plain
 * file in a directory other processes on a rooted device can reach, and
 * hydrating whatever it happens to contain would make it a way to put
 * arbitrary data into the query cache.
 */
export async function restoreCatalogueSnapshot(client: QueryClient): Promise<boolean> {
  try {
    const file = snapshotFile();
    if (!file.exists) return false;
    const raw = await file.text();
    if (raw.length > MAX_BYTES) return false;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return false;
    if (!Array.isArray((parsed as { queries?: unknown }).queries)) return false;

    // Cast only after the shape has been checked, and keep each entry whole:
    // a dehydrated query carries more than its key, and rebuilding one from
    // the fields this function happens to name would drop the rest.
    const state = parsed as DehydratedState;
    const safe = state.queries.filter(
      (query) => Array.isArray(query.queryKey) && isPublicQueryKey(query.queryKey),
    );
    if (safe.length === 0) return false;

    hydrate(client, { queries: safe, mutations: [] });
    return true;
  } catch {
    return false;
  }
}

/** Drops the file. For a sign-out, or a cache that will not parse. */
export async function clearCatalogueSnapshot(): Promise<void> {
  try {
    const file = snapshotFile();
    if (file.exists) file.delete();
  } catch {
    // Nothing to do about it, and nothing depends on it being gone.
  }
}
