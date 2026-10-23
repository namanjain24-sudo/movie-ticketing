import type { AuthResponse, User } from '@app/shared';
import { create } from 'zustand';
import { STORAGE_KEYS, secureStorage } from '../../lib/storage';
import { ApiRequestError } from '../../api/client';
import { authApi } from '../../api/auth';

type AuthState = {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** False until the stored session has been read from the keychain. */
  isReady: boolean;

  restore: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: User) => void;
  /** Returns a fresh access token, or null when the session is gone. */
  refreshSession: () => Promise<string | null>;
};

async function persist(tokens: AuthResponse['tokens']) {
  await Promise.all([
    secureStorage.set(STORAGE_KEYS.accessToken, tokens.accessToken),
    secureStorage.set(STORAGE_KEYS.refreshToken, tokens.refreshToken),
  ]);
}

async function clearPersisted() {
  await Promise.all([
    secureStorage.remove(STORAGE_KEYS.accessToken),
    secureStorage.remove(STORAGE_KEYS.refreshToken),
  ]);
}

/**
 * A single in-flight refresh is shared by every caller, so a burst of parallel
 * 401s cannot rotate the refresh token more than once.
 */
let inFlightRefresh: Promise<string | null> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isReady: false,

  restore: async () => {
    // `isReady` gates the whole navigator, so every path out of here has to
    // set it. A throw that skipped it left the app on the splash screen for
    // good.
    try {
      const [accessToken, refreshToken] = await Promise.all([
        secureStorage.get(STORAGE_KEYS.accessToken),
        secureStorage.get(STORAGE_KEYS.refreshToken),
      ]);

      if (!refreshToken) return;

      set({ accessToken, refreshToken });
      try {
        set({ user: await authApi.me() });
        return;
      } catch (err) {
        /**
         * Being unable to reach the server says nothing about whether the
         * session is still good, and this is the launch most likely to hit it:
         * no signal on the way into the cinema, or a free host that has spun
         * down and takes most of a minute to wake.
         *
         * Keep the tokens and let the app open. The first request that gets a
         * real 401 will refresh or sign out properly, with the server actually
         * having answered.
         */
        if (err instanceof ApiRequestError && err.isNetworkError) return;
      }

      // The server answered and refused the access token. One refresh decides
      // whether the session survives.
      const fresh = await get().refreshSession();
      if (!fresh) return;
      try {
        set({ user: await authApi.me() });
      } catch (err) {
        if (err instanceof ApiRequestError && err.isNetworkError) return;
        await clearPersisted();
        set({ user: null, accessToken: null, refreshToken: null });
      }
    } finally {
      set({ isReady: true });
    }
  },

  signIn: async (email, password) => {
    const { user, tokens } = await authApi.login({ email, password });
    await persist(tokens);
    set({ user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  },

  signUp: async (name, email, password) => {
    const { user, tokens } = await authApi.register({ name, email, password });
    await persist(tokens);
    set({ user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  },

  signOut: async () => {
    const token = get().refreshToken;
    set({ user: null, accessToken: null, refreshToken: null });
    await clearPersisted();
    if (token) {
      // Best effort: the local session is already gone either way.
      await authApi.logout(token).catch(() => undefined);
    }
  },

  setUser: (user) => set({ user }),

  refreshSession: async () => {
    if (inFlightRefresh) return inFlightRefresh;

    const token = get().refreshToken;
    if (!token) return null;

    inFlightRefresh = (async () => {
      try {
        const { user, tokens } = await authApi.refresh(token);
        await persist(tokens);
        set({ user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
        return tokens.accessToken;
      } catch (err) {
        /**
         * Only a server that actually refused the refresh token is grounds for
         * throwing the session away. A refresh is a POST, so `client.ts` never
         * retries it on a cold start; treating that one failed round trip as a
         * rejection used to wipe the keychain and sign the user out for good,
         * on nothing more than a dropped connection.
         */
        const refused = err instanceof ApiRequestError && err.status >= 400 && err.status < 500;
        if (refused) {
          await clearPersisted();
          set({ user: null, accessToken: null, refreshToken: null });
        }
        return null;
      } finally {
        inFlightRefresh = null;
      }
    })();

    return inFlightRefresh;
  },
}));
