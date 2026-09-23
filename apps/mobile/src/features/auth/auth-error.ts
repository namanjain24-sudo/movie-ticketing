import { ApiRequestError } from '../../api/client';
import { config } from '../../lib/config';

/**
 * Sign-in/sign-up keep the form on screen on failure — a network error there
 * isn't a reason to swap in the full-screen `ErrorState`, but it deserves the
 * same "cannot reach the server" wording and, in dev, the same address
 * diagnostic, rather than the generic "please try again" a validation error
 * gets.
 */
export function authErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof ApiRequestError)) return fallback;
  if (!err.isNetworkError) return err.message;

  if (!__DEV__) return 'Cannot reach the server. Check your connection and try again.';

  const source =
    config.apiUrlSource === 'dev-server'
      ? 'from the Expo dev server. Start the API with `npm run api`.'
      : config.apiUrlSource === 'env'
        ? 'from EXPO_PUBLIC_API_URL.'
        : 'no dev server host available; fell back to loopback.';
  return `Cannot reach the server. Tried ${config.apiUrl} (${source})`;
}
