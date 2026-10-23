import { router } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { configureApiClient } from '../../api/client';
import { queryClient } from '../../lib/query-client';
import { useAuthStore } from './auth-store';

/**
 * Connects the API client to the auth store. Kept out of the store itself so
 * the store stays a plain, testable state container.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const restore = useAuthStore((s) => s.restore);

  useEffect(() => {
    configureApiClient({
      getAccessToken: () => useAuthStore.getState().accessToken,
      refresh: () => useAuthStore.getState().refreshSession(),
      onSessionExpired: () => {
        void useAuthStore.getState().signOut();
        queryClient.clear();
        /**
         * Signing out is not enough on its own. The only auth guard in the app
         * is the tabs layout, so a session that expires anywhere else leaves
         * the user on a screen that can no longer load anything: checkout,
         * the seat map, a ticket. Every query there refetches unauthenticated,
         * 401s, and offers a "Try again" that can never succeed.
         *
         * `replace`, not `push`: there is nothing worth going back to once the
         * session is gone.
         */
        router.replace('/(auth)/sign-in');
      },
    });
    void restore();
  }, [restore]);

  return children;
}

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const isReady = useAuthStore((s) => s.isReady);
  return { user, isReady, isSignedIn: user !== null };
}
