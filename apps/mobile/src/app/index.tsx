import { Redirect } from 'expo-router';
import { useAuth } from '../features/auth/auth-provider';
import { useOnboarding } from '../features/onboarding/onboarding-provider';

/**
 * Entry point: send the user to the app, to the one-time intro, or to
 * sign-in. `_layout.tsx` already holds the splash screen until both auth and
 * the onboarding flag have been read, so `onboarding.seen` here is never the
 * stale default.
 */
export default function Index() {
  const { isSignedIn } = useAuth();
  const onboarding = useOnboarding();

  if (isSignedIn) return <Redirect href="/(tabs)" />;
  if (!onboarding.seen) return <Redirect href="/onboarding" />;
  return <Redirect href="/(auth)/sign-in" />;
}
