import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Tokens live in the iOS keychain / Android keystore. Web has no equivalent,
 * so it falls back to localStorage, which is why the web build should be
 * treated as the least trusted target.
 */
export const secureStorage = {
  /**
   * Never rejects. A keychain read can fail for reasons that have nothing to
   * do with this app: a corrupt entry, a device still locked during a cold
   * start, a restore from a backup taken on another device. Both callers gate
   * the splash screen on this resolving, so a rejection used to leave the app
   * on the splash permanently, with no error shown and nothing to retry.
   *
   * Answering "no token" costs a signed-out session, which takes the user ten
   * seconds to fix. Throwing costs them the app.
   */
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },

  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        // Private browsing can refuse writes; the session just will not persist.
      }
      return;
    }
    try {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    } catch {
      // Same bargain as `get`: a session that does not survive a restart is a
      // nuisance, an unhandled rejection on a hot path is a crash.
    }
  },

  async remove(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        // Nothing to clean up.
      }
      return;
    }
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Nothing to clean up, or nothing we can do about it.
    }
  },
};

export const STORAGE_KEYS = {
  accessToken: 'auth.accessToken',
  refreshToken: 'auth.refreshToken',
  /** The signed-in user, so a launch with no network still opens the app. */
  user: 'auth.user',
  themePreference: 'settings.themePreference',
  recentFilmSearches: 'search.recentFilms',
  recentCinemaSearches: 'search.recentCinemas',
  recentlyViewedFilms: 'catalog.recentlyViewed',
  onboardingSeen: 'onboarding.seen',
  notificationHistory: 'notifications.history',
  /** References of the tickets kept for offline use, newest first. */
  savedTicketIndex: 'tickets.index',
  /** Prefix; the reference is appended. One key per ticket, see ticket-vault. */
  savedTicketPrefix: 'tickets.saved.',
} as const;
