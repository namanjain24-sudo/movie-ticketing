import * as Location from 'expo-location';
import { useCallback, useState, useSyncExternalStore } from 'react';

export type Coords = { lat: number; lng: number };

export type LocationState =
  | { status: 'idle' }
  | { status: 'asking' }
  | { status: 'granted'; coords: Coords }
  | { status: 'denied' }
  | { status: 'failed'; message: string };

/**
 * The user's position, asked for only when they ask for it.
 *
 * Nothing here runs on mount. A location prompt on first launch, before the
 * person has seen what the app does, is the prompt most people deny — and a
 * denial is sticky, so the one chance to explain why the app wants it is worth
 * spending on a screen where "cinemas near me" is visibly the thing being
 * asked for.
 *
 * `Balanced` accuracy rather than `High`: this list is sorted in kilometres.
 * GPS-grade precision would cost seconds and battery to change nothing.
 */
/**
 * The last position the person actually granted, for the rest of the session.
 *
 * `useUserLocation` keeps its state per component, which is right for the
 * screen that does the asking — but it meant a grant on the Cinemas tab was
 * forgotten the moment that screen unmounted. A film page could not sort its
 * cinemas by distance without asking all over again, on a screen where
 * "cinemas near me" is not visibly what is being requested, and a second
 * prompt is the one most people deny.
 *
 * So the answer is remembered and the question is not repeated. Screens that
 * would merely *benefit* from a position read this and do nothing when it is
 * empty; only the Cinemas tab ever asks.
 *
 * In memory only. A coordinate is the sort of thing that should not outlive
 * the session that was given it, and a stale one is worse than none: it would
 * sort a film page in Mumbai by how near things are to last week's Delhi.
 */
let lastKnown: Coords | null = null;

const listeners = new Set<() => void>();

/** Reads the remembered position, re-rendering if one arrives later. */
export function useLastKnownLocation(): Coords | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => lastKnown,
    () => null,
  );
}

export function useUserLocation() {
  const [state, setState] = useState<LocationState>({ status: 'idle' });

  const request = useCallback(async () => {
    setState({ status: 'asking' });
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setState({ status: 'denied' });
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
      lastKnown = coords;
      for (const notify of listeners) notify();
      setState({ status: 'granted', coords });
    } catch (error) {
      // Indoors with location services off is the common case, and it throws
      // rather than resolving. The list still works without a position.
      setState({
        status: 'failed',
        message:
          error instanceof Error && error.message ? error.message : 'Could not read your location.',
      });
    }
  }, []);

  const clear = useCallback(() => {
    // Turning it off on the screen that asked turns it off everywhere. Half a
    // retraction is not one.
    lastKnown = null;
    for (const notify of listeners) notify();
    setState({ status: 'idle' });
  }, []);

  return { state, request, clear };
}
