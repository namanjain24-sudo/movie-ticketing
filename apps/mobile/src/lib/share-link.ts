import * as Linking from 'expo-linking';

/**
 * A deep link back into the app for a share message. The app already answers
 * every one of these paths — Expo Router's file-based routing makes every
 * screen a deep link target for free — this just builds the URL string.
 *
 * The scheme link (`app.json`'s `expo.scheme`, e.g. `mobileapp://...`) opens
 * the app directly when tapped somewhere that recognises custom schemes (the
 * device itself, another app on it). Most chat apps only linkify
 * `http(s)://`, so this is the honest first step; the fuller fix is a real
 * universal link once the app has a hosted domain to serve the association
 * file from.
 */
export function shareLink(path: string): string {
  return Linking.createURL(path);
}
