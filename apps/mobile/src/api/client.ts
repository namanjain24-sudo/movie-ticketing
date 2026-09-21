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

async function send<T>(path: string, options: RequestOptions, retry: boolean): Promise<T> {
  const { method = 'GET', body, signal } = options;

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), config.requestTimeoutMs);
  signal?.addEventListener('abort', () => timeout.abort(), { once: true });

  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = options.public ? null : hooks?.getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: timeout.signal,
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    throw new ApiRequestError(
      0,
      aborted ? 'TIMEOUT' : 'NETWORK',
      aborted ? 'The request took too long' : 'Cannot reach the server. Check your connection.',
    );
  } finally {
    clearTimeout(timer);
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
