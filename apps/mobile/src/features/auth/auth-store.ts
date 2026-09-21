import type { AuthResponse, User } from '@app/shared';
import { create } from 'zustand';
import { STORAGE_KEYS, secureStorage } from '../../lib/storage';
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
    const [accessToken, refreshToken] = await Promise.all([
      secureStorage.get(STORAGE_KEYS.accessToken),
      secureStorage.get(STORAGE_KEYS.refreshToken),
    ]);

    if (!refreshToken) {
      set({ isReady: true });
      return;
    }

    set({ accessToken, refreshToken });
    try {
      const user = await authApi.me();
      set({ user, isReady: true });
    } catch {
      // The access token was stale. One refresh decides whether the session
      // survives a cold start.
      const fresh = await get().refreshSession();
      if (fresh) {
        try {
          set({ user: await authApi.me() });
        } catch {
          await clearPersisted();
          set({ user: null, accessToken: null, refreshToken: null });
        }
      }
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
      } catch {
        await clearPersisted();
        set({ user: null, accessToken: null, refreshToken: null });
        return null;
      } finally {
        inFlightRefresh = null;
      }
    })();

    return inFlightRefresh;
  },
}));
