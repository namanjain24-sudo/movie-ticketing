import * as Location from 'expo-location';
import { useCallback, useState } from 'react';

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
      setState({
        status: 'granted',
        coords: { lat: position.coords.latitude, lng: position.coords.longitude },
      });
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

  const clear = useCallback(() => setState({ status: 'idle' }), []);

  return { state, request, clear };
}
