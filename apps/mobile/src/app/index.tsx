import { Redirect } from 'expo-router';
import { useOnboarding } from '../features/onboarding/onboarding-provider';

/**
 * Entry point: the intro once, then the app.
 *
 * Signing in is no longer the price of looking. The API was built for this
 * all along — the catalogue, the events, the offers and the seat map itself
 * all answer an anonymous request, and only taking a seat returns a 401 — but
 * the app put a password in front of the lot. A person who has heard about a
 * film and wants to know what time it is on had to invent a password first.
 *
 * So the account is asked for where it is actually needed: at the point of
 * holding seats, and on the two tabs that are nothing but somebody's own
 * account. Everything else opens.
 *
 * `_layout.tsx` already holds the splash screen until both auth and the
 * onboarding flag have been read, so `onboarding.seen` here is never the
 * stale default.
 */
export default function Index() {
  const onboarding = useOnboarding();

  if (!onboarding.seen) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}
