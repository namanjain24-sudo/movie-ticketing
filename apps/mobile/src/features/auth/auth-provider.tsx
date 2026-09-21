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
