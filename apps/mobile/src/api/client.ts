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

/**
 * Whether the server has answered anything at all this session.
 *
 * On a free host the service sleeps after a quarter of an hour and takes most
 * of a minute to wake, and the very first thing a new user does is submit a
 * form. A `GET` can afford to discover that by timing out and retrying on a
 * longer budget; a mutation cannot, because a request that timed out may still
 * have been received, which is why `send` never retries one.
 *
 * So the waiting is moved in front of the mutation instead of after it.
 *
 * `lastAnsweredAt`, not a boolean. It was a boolean, latched true the first
 * time anything came back and never cleared, which quietly assumed the server
 * could not go back to sleep. It can, after fifteen idle minutes, and that is
 * an ordinary gap: open the app, look at a film, talk to somebody, then tap
 * Sign in. The latch said "awake", the wait was skipped, the POST went
 * straight at a sleeping host on a fifteen second deadline, and a mutation is
 * never retried — so it failed outright with "cannot reach the server" while
 * the server was merely starting. Reproduced on a device: the host answered a
 * probe 86 seconds later, well inside the budget the app refused to spend.
 *
 * An answer is now evidence with a shelf life. Inside `awakeConfidenceMs` a
 * mutation goes straight out; past it, one cheap probe decides — a round trip
 * on a warm server, and the full patient wait on a cold one.
 */
let lastAnsweredAt = 0;
let waking: Promise<void> | null = null;

/** The server answered recently enough to still believe it is up. */
function answeredRecently(): boolean {
  return Date.now() - lastAnsweredAt < config.awakeConfidenceMs;
}

/** Called wherever the server proves it is up. */
function noteServerAnswered(): void {
  lastAnsweredAt = Date.now();
}

/**
 * Resolves once the server is answering, or gives up on the whole budget.
 *
 * Polls rather than taking one long shot. A single fetch held open for a
 * minute and a half is at the mercy of whatever the OS and the network decide
 * to do with an idle socket, and it can only ever succeed at the very end.
 * Short probes on a loop notice the moment the server comes up, survive a
 * connection being dropped while it boots, and give `onWakeProgress` something
 * to report.
 */
function waitForServer(signal?: AbortSignal): Promise<void> {
  if (answeredRecently()) return Promise.resolve();

  waking ??= (async () => {
    const until = Date.now() + config.wakeBudgetMs;
    let attempt = 0;
    while (Date.now() < until && !signal?.aborted) {
      attempt += 1;
      notifyWake(attempt);
      try {
        await fetchWithin(
          `${config.apiUrl}/health/live`,
          { method: 'GET', headers: { Accept: 'application/json' } },
          config.wakeProbeTimeoutMs,
          signal,
        );
        noteServerAnswered();
        return;
      } catch {
        // Expected while it boots. Wait a beat so a sleeping host is not
        // hammered, then ask again.
        await new Promise((r) => setTimeout(r, config.wakeProbeGapMs));
      }
    }
    // Out of budget. The real request runs anyway and reports its own failure,
    // rather than this inventing one on its behalf.
  })().finally(() => {
    waking = null;
    notifyWake(0);
  });

  return waking;
}

/**
 * Told how many wake probes have gone out, so a screen can explain a long
 * wait. `0` means the waiting is over, one way or the other.
 */
type WakeListener = (attempt: number) => void;
const wakeListeners = new Set<WakeListener>();

function notifyWake(attempt: number) {
  for (const listener of wakeListeners) listener(attempt);
}

export function onWakeProgress(listener: WakeListener): () => void {
  wakeListeners.add(listener);
  return () => wakeListeners.delete(listener);
}

/** True while the client is waiting for a sleeping server to come up. */
export function isWakingServer(): boolean {
  return waking !== null;
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

  // A mutation sent at a sleeping server fails on a fifteen second deadline
  // and cannot be retried, so make sure it is awake first and send it once.
  // `waitForServer` is a no-op when the server answered a moment ago.
  if (method !== 'GET') await waitForServer(signal);

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
     * by definition, so re-sending it cannot do anything twice. A mutation is
     * never re-sent — one that timed out may still have been received — which
     * is why `waitForServer` above does its waiting before sending instead.
     */
    if (method !== 'GET') throw unreachable(err);
    try {
      response = await fetchWithin(url, init, config.coldStartTimeoutMs, signal);
    } catch (retryErr) {
      throw unreachable(retryErr);
    }
  }

  // Anything that came back, including a 4xx, proves the server is up — for
  // now. See `lastAnsweredAt`: it can be asleep again in fifteen minutes.
  noteServerAnswered();

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
  // Shares the one probe with `waitForServer`, so a mutation sent while this
  // is still in flight waits for the same request rather than starting a
  // second one, and a mutation sent after it succeeds does not wait at all.
  void waitForServer();
}
