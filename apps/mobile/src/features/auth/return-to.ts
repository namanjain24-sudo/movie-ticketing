import { router } from 'expo-router';

/**
 * Where to send somebody after they sign in.
 *
 * The app lets people browse without an account, so sign-in is no longer the
 * front door — it is a gate reached partway through something. Somebody who
 * has chosen two seats and tapped Pay is not asking to be shown the home
 * screen; they are asking to buy those seats, and sending them back to the
 * tabs costs them the whole choice.
 *
 * Only in-app paths are honoured. The value reaches this through a route
 * param, and a route param is the sort of thing a link can carry in from
 * outside; `/(tabs)` is a dull place to be sent, which is the point.
 */
const FALLBACK = '/(tabs)';

export function safeReturnTo(next: unknown): string {
  if (typeof next !== 'string' || next.length === 0) return FALLBACK;
  // A single leading slash and nothing that could name another host: "//evil"
  // and "https://evil" are both links away from the app wearing a path's
  // clothes, and neither is a screen this app has.
  if (!next.startsWith('/') || next.startsWith('//')) return FALLBACK;
  if (next.includes('://')) return FALLBACK;
  // Signing in only to be handed back to the sign-in form is a loop.
  if (next.startsWith('/(auth)') || next.startsWith('/reset-password')) return FALLBACK;
  return next;
}

/**
 * Sends somebody to sign in, remembering where they were.
 *
 * `push`, not `replace`: they have not lost anything by being asked, and
 * backing out should return them to the screen they were on with their
 * choices intact.
 */
export function signInThenReturn(here: string): void {
  router.push({ pathname: '/(auth)/sign-in', params: { next: here } });
}
