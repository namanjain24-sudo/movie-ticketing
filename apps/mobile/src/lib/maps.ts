import { Linking, Platform } from 'react-native';

/**
 * Handing a place off to a real maps app.
 *
 * The app draws its own map to *show* where a cinema is; it does not try to
 * navigate. Turn-by-turn is a whole product, the phone already has a good one,
 * and it knows things this app does not — live traffic, the user's car, which
 * of their maps apps they actually use.
 *
 * Google Maps is asked for by name, because the address data here is Indian and
 * Google's coverage of Indian street addresses is materially better than Apple's.
 * When it is not installed, the universal `https://` link opens the website or
 * whatever app has claimed those links, which is the right fallback on both
 * platforms.
 */

export type Place = {
  latitude: number;
  longitude: number;
  /** Shown as the pin's label, so the user sees a name rather than a number. */
  label: string;
};

/** The canonical web URL for a place. Works everywhere, app or no app. */
export function mapsUrl(place: Place): string {
  const query = encodeURIComponent(`${place.latitude},${place.longitude}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

/** The web URL for directions to a place from wherever the user is. */
export function directionsUrl(place: Place): string {
  const destination = encodeURIComponent(`${place.latitude},${place.longitude}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

/**
 * The native scheme, tried first so the request lands in the installed app
 * rather than a browser tab. `comgooglemaps://` on iOS is Google Maps itself;
 * `geo:` on Android is the platform's own place intent, which every maps app
 * on the device can answer.
 */
function nativeDirectionsUrl(place: Place): string | null {
  const { latitude, longitude, label } = place;
  if (Platform.OS === 'ios') {
    return `comgooglemaps://?daddr=${latitude},${longitude}&directionsmode=driving`;
  }
  if (Platform.OS === 'android') {
    return `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodeURIComponent(label)})`;
  }
  return null;
}

async function open(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens directions, preferring the installed app and falling back to the web.
 *
 * `canOpenURL` is checked rather than trusted alone: on iOS it answers false
 * for any scheme not declared in `LSApplicationQueriesSchemes`, which in Expo
 * Go is not ours to declare. So the native attempt is made regardless and the
 * web URL catches the failure.
 */
export async function openDirections(place: Place): Promise<void> {
  const native = nativeDirectionsUrl(place);
  if (native && (await open(native))) return;
  await open(directionsUrl(place));
}

export async function openPlace(place: Place): Promise<void> {
  await open(mapsUrl(place));
}

/** Dials a number. No-op on web, where there is nothing to dial with. */
export async function callNumber(phone: string): Promise<void> {
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (!cleaned) return;
  await open(`tel:${cleaned}`);
}

/** `1.2 km` / `640 m` / `612 km`. Precision the number actually carries. */
export function formatDistance(km: number | null): string | null {
  if (km === null) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
