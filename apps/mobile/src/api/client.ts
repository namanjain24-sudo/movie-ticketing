import { apiErrorSchema, type ApiError } from '@app/shared';
import { config } from '../lib/config';

/** Thrown for every failed request, so callers have one thing to catch. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  /** True when the device could not reach the server at all. */
  get isNetworkError() {
    return this.status === 0;
  }
}

type TokenHooks = {
  getAccessToken: () => string | null;
  /** Returns a fresh access token, or null when the session is unrecoverable. */
  refresh: () => Promise<string | null>;
  onSessionExpired: () => void;
};

let hooks: TokenHooks | null = null;

/** Wired once at startup by the auth provider. */
export function configureApiClient(next: TokenHooks) {
  hooks = next;
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Skips the Authorization header and the refresh retry. */
  public?: boolean;
  /** Extra headers, such as the `Idempotency-Key` the hold endpoint requires. */
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

async function parseError(response: Response): Promise<ApiRequestError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const parsed = apiErrorSchema.safeParse(payload);
  if (parsed.success) {
    const { code, message, details } = (parsed.data as ApiError).error;
    return new ApiRequestError(response.status, code, message, details);
  }
  return new ApiRequestError(response.status, 'INTERNAL', `Request failed (${response.status})`);
}

/** One fetch under its own deadline, without disturbing the caller's signal. */
async function fetchWithin(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  callerSignal: AbortSignal | undefined,
): Promise<Response> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const relay = () => timeout.abort();
  callerSignal?.addEventListener('abort', relay, { once: true });
  try {
    return await fetch(url, { ...init, signal: timeout.signal });
  } finally {
    clearTimeout(timer);
    // Removed explicitly: a long-lived caller signal would otherwise
    // accumulate one listener per request it outlives.
    callerSignal?.removeEventListener('abort', relay);
  }
}

function unreachable(err: unknown): ApiRequestError {
  const aborted = err instanceof Error && err.name === 'AbortError';
  return new ApiRequestError(
    0,
    aborted ? 'TIMEOUT' : 'NETWORK',
    aborted ? 'The request took too long' : 'Cannot reach the server. Check your connection.',
  );
}

async function send<T>(path: string, options: RequestOptions, retry: boolean): Promise<T> {
  const { method = 'GET', body, signal } = options;

  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = options.public ? null : hooks?.getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `${config.apiUrl}${path}`;
  const init: RequestInit = {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  };

  let response: Response;
  try {
    response = await fetchWithin(url, init, config.requestTimeoutMs, signal);
  } catch (err) {
    // The caller cancelled — a screen was left, a search was retyped. Final.
    if (signal?.aborted) throw unreachable(err);

    /**
     * A free host sleeps after a quarter-hour of inactivity and takes the
     * better part of a minute to wake, which is far longer than the normal
     * deadline is willing to wait. The first request after a quiet spell
     * therefore fails on a server that is merely starting, not broken.
     *
     * Retried once on a much longer budget, and only for GET: a safe method
     * by definition, so re-sending it cannot do anything twice. Everything
     * that changes state is left to the user to retry deliberately, where
     * the idempotency key makes the repeat safe.
     */
    if (method !== 'GET') throw unreachable(err);
    try {
      response = await fetchWithin(url, init, config.coldStartTimeoutMs, signal);
    } catch (retryErr) {
      throw unreachable(retryErr);
    }
  }

  // One silent refresh-and-retry, then give up and sign the user out.
  if (response.status === 401 && retry && !options.public && hooks) {
    const refreshed = await hooks.refresh();
    if (refreshed) return send<T>(path, options, false);
    hooks.onSessionExpired();
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    send<T>(path, { ...options, method: 'GET' }, true),
  post: <T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method'> = {}) =>
    send<T>(path, { ...options, method: 'POST', body }, true),
  put: <T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method'> = {}) =>
    send<T>(path, { ...options, method: 'PUT', body }, true),
  patch: <T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method'> = {}) =>
    send<T>(path, { ...options, method: 'PATCH', body }, true),
  delete: <T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    send<T>(path, { ...options, method: 'DELETE' }, true),
};

/**
 * Nudges a sleeping server awake at launch, so the wait overlaps the intro
 * and the sign-in form rather than landing on the first thing the user taps.
 *
 * Deliberately fire-and-forget and deliberately unauthenticated: nothing waits
 * on it, nothing shows a spinner for it, and a failure means only that the
 * first real request pays the wake-up cost it would have paid anyway. It
 * matters most for signing in, which is a POST and so is never auto-retried.
 */
export function warmUpServer(): void {
  void fetch(`${config.apiUrl}/health/live`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  }).catch(() => {
    // Nothing to do and nothing to report: this is an optimisation, not a
    // health check the app's behaviour depends on.
  });
}
