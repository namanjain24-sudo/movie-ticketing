import { Redirect, Stack, useGlobalSearchParams } from 'expo-router';
import { useAuth } from '../../features/auth/auth-provider';
import { safeReturnTo } from '../../features/auth/return-to';

/**
 * Nobody signed in stays on a sign-in form.
 *
 * This is the one place that decides where they go instead, and it has to be:
 * the moment `signIn` lands, the auth store updates, this layout re-renders
 * and redirects — which beats any `router.replace` the form itself was about
 * to run. Having the form choose too meant the destination was settled by
 * whichever won, and the layout always won, so somebody who asked to be sent
 * back to their seat map arrived at the home screen instead.
 *
 * `useGlobalSearchParams`, not local: `next` belongs to the child route, and
 * a layout's local params are its own segment's.
 */
export default function AuthLayout() {
  const { isSignedIn } = useAuth();
  const { next } = useGlobalSearchParams<{ next?: string }>();

  if (isSignedIn) return <Redirect href={safeReturnTo(next)} />;

  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
