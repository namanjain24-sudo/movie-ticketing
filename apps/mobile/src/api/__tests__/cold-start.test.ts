/**
 * The free host sleeps after a quarter of an hour and takes most of a minute
 * to wake. These tests pin the behaviour that makes that survivable, because
 * it is the path a brand new user hits first: install the app, fill in the
 * sign-up form, and submit it at a server that is still starting.
 *
 * `serverAnswered` is module state that deliberately outlives a request, so
 * every test loads its own copy of the client rather than sharing one.
 */
import type { api as Api, warmUpServer as WarmUp, ApiRequestError as ApiErr } from '../client';

type Client = { api: typeof Api; warmUpServer: typeof WarmUp; ApiRequestError: typeof ApiErr };

let fetchMock: jest.Mock;

/**
 * A fresh client, with no memory of whether the server has answered before.
 *
 * `require` inside `jest.isolateModules` is the only way to get a module
 * re-evaluated; a static import is bound once and would share the very state
 * these tests need to vary.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
function loadClient(): Client {
  let mod!: Client;
  jest.isolateModules(() => {
    mod = require('../client') as Client;
  });
  return mod;
}

/** The wake budget, read the same isolated way `liveUrl` reads the host. */
function wakeBudgetMs(): number {
  let ms!: number;
  jest.isolateModules(() => {
    ms = (require('../../lib/config') as typeof import('../../lib/config')).config.wakeBudgetMs;
  });
  return ms;
}

function liveUrl(): string {
  let url!: string;
  jest.isolateModules(() => {
    url = `${(require('../../lib/config') as typeof import('../../lib/config')).config.apiUrl}/health/live`;
  });
  return url;
}
/* eslint-enable @typescript-eslint/no-require-imports */

/** A fetch the test decides when to settle. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const ok = (body: unknown = {}) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

const aborted = () => {
  const err = new Error('aborted');
  err.name = 'AbortError';
  return err;
};

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('cold start', () => {
  it('wakes the server before sending a mutation, and sends it exactly once', async () => {
    const { api } = loadClient();
    const wake = deferred<Response>();
    fetchMock
      .mockImplementationOnce(() => wake.promise) // the health probe
      .mockImplementationOnce(async () => ok({ id: 'u1' })); // the real POST

    const posted = api.post('/v1/auth/register', { email: 'a@b.com' });

    await Promise.resolve();
    // The POST has not gone out: it is waiting on the probe.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(liveUrl());

    wake.resolve(ok());
    await expect(posted).resolves.toEqual({ id: 'u1' });

    // A mutation that timed out may still have been received, so it must
    // never be re-sent. One POST, no matter how long the wake took.
    expect(fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST')).toHaveLength(1);
  });

  it('does not wait again once the server has answered', async () => {
    const { api } = loadClient();
    fetchMock.mockImplementation(async () => ok({ ok: true }));

    await api.post('/v1/first', {});
    const after = fetchMock.mock.calls.length;
    await api.post('/v1/second', {});

    // The second mutation costs exactly one request: no second probe.
    expect(fetchMock.mock.calls.length).toBe(after + 1);
  });

  it('shares one probe between the launch warm-up and a mutation', async () => {
    const { api, warmUpServer } = loadClient();
    const wake = deferred<Response>();
    fetchMock
      .mockImplementationOnce(() => wake.promise)
      .mockImplementationOnce(async () => ok({ id: 'u1' }));

    warmUpServer();
    const posted = api.post('/v1/auth/login', {});

    await Promise.resolve();
    expect(fetchMock.mock.calls.filter((c) => c[0] === liveUrl())).toHaveLength(1);

    wake.resolve(ok());
    await posted;
  });

  it('reports a timeout as a timeout, not as a dead connection', async () => {
    // Fake timers, because a server that never answers makes `waitForServer`
    // poll for its whole budget, and that budget is deliberately long enough
    // to outlast a real cold start.
    jest.useFakeTimers();
    try {
      const { api, ApiRequestError } = loadClient();
      fetchMock.mockImplementation(async () => {
        throw aborted();
      });

      const pending = api.post('/v1/auth/register', {}).catch((e: unknown) => e);
      // Derived, not a literal: this used to advance a flat 200 seconds, which
      // silently stopped clearing the budget the moment the budget grew past
      // it, and the test failed by timing out rather than by saying so.
      await jest.advanceTimersByTimeAsync(wakeBudgetMs() + 30_000);
      const err = await pending;

      expect(err).toBeInstanceOf(ApiRequestError);
      // The distinction the sign-up screen uses to avoid blaming the user's
      // connection for a server that is merely starting.
      expect((err as InstanceType<typeof ApiRequestError>).code).toBe('TIMEOUT');
    } finally {
      jest.useRealTimers();
    }
  }, 30_000);

  it('gives up once the wake budget is spent rather than hanging', async () => {
    jest.useFakeTimers();
    try {
      const { api } = loadClient();
      fetchMock.mockImplementation(async () => {
        throw new Error('ECONNREFUSED');
      });

      const pending = api.post('/v1/auth/login', {}).catch(() => 'rejected');
      await jest.advanceTimersByTimeAsync(wakeBudgetMs() + 30_000);
      expect(await pending).toBe('rejected');
    } finally {
      jest.useRealTimers();
    }
  }, 30_000);

  it('does not put a probe in front of a GET: it has its own long retry', async () => {
    const { api } = loadClient();
    fetchMock.mockImplementation(async () => ok({ items: [] }));

    await api.get('/v1/movies');

    expect(fetchMock.mock.calls[0]?.[0]).toContain('/v1/movies');
  });
});
