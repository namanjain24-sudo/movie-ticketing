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

  if (!__DEV__) {
    /**
     * A request that timed out and a host that cannot be reached are not the
     * same failure, and `isNetworkError` covers both because it only asks
     * whether the status is 0. Telling someone on full signal to check their
     * connection is wrong and leaves them nothing to do.
     *
     * On a free host the usual cause of a slow first request is the service
     * waking from sleep, which takes about a minute and then works. Say that.
     */
    return err.code === 'TIMEOUT'
      ? 'The server is waking up. That takes about a minute on the free plan, then it works. Try again.'
      : 'Cannot reach the server. Check your connection and try again.';
  }

  const source =
    config.apiUrlSource === 'dev-server'
      ? 'from the Expo dev server. Start the API with `npm run api`.'
      : config.apiUrlSource === 'env'
        ? 'from EXPO_PUBLIC_API_URL.'
        : 'no dev server host available; fell back to loopback.';
  return `Cannot reach the server. Tried ${config.apiUrl} (${source})`;
}
