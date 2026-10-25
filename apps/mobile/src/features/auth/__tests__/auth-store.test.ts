import type { AuthResponse } from '@app/shared';
import { authApi } from '../../../api/auth';
import { ApiRequestError } from '../../../api/client';
import { secureStorage, STORAGE_KEYS } from '../../../lib/storage';
import { useAuthStore } from '../auth-store';

jest.mock('../../../api/auth');
jest.mock('../../../lib/storage', () => {
  const store = new Map<string, string>();
  return {
    STORAGE_KEYS: {
      accessToken: 'auth.accessToken',
      refreshToken: 'auth.refreshToken',
      user: 'auth.user',
    },
    secureStorage: {
      get: jest.fn(async (k: string) => store.get(k) ?? null),
      set: jest.fn(async (k: string, v: string) => void store.set(k, v)),
      remove: jest.fn(async (k: string) => void store.delete(k)),
    },
  };
});

const mockedApi = authApi as jest.Mocked<typeof authApi>;

const session: AuthResponse = {
  user: {
    id: 'u1',
    email: 'naman@example.com',
    name: 'Naman',
    avatarUrl: null,
    createdAt: new Date().toISOString(),
  },
  tokens: { accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: 900 },
};

beforeEach(async () => {
  jest.clearAllMocks();
  await secureStorage.remove(STORAGE_KEYS.accessToken);
  await secureStorage.remove(STORAGE_KEYS.refreshToken);
  await secureStorage.remove(STORAGE_KEYS.user);
  useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, isReady: false });
});

/**
 * Found by putting a real Android emulator into airplane mode and relaunching
 * the released APK.
 *
 * `restore` already kept the tokens when the server could not be reached, and
 * its comment said — correctly — that being unable to reach the server says
 * nothing about whether the session is good. But routing keys off `user`, and
 * `user` could only ever come from a live `GET /users/me`. So the tokens
 * survived and the app redirected to sign-in anyway. A plane, a basement, or
 * the minute a free host takes to wake all threw you out of a session that
 * was perfectly valid — and made the offline ticket unreachable in exactly
 * the situation it was built for.
 */
describe('restoring a session at launch', () => {
  it('opens the app signed in when the server cannot be reached', async () => {
    await secureStorage.set(STORAGE_KEYS.accessToken, 'access-1');
    await secureStorage.set(STORAGE_KEYS.refreshToken, 'refresh-1');
    await secureStorage.set(STORAGE_KEYS.user, JSON.stringify(session.user));
    mockedApi.me.mockRejectedValue(new ApiRequestError(0, 'NETWORK', 'Cannot reach the server.'));

    await useAuthStore.getState().restore();

    const state = useAuthStore.getState();
    expect(state.user).toEqual(session.user);
    expect(state.isReady).toBe(true);
    // Nothing thrown away on the strength of a dropped connection.
    expect(await secureStorage.get(STORAGE_KEYS.refreshToken)).toBe('refresh-1');
  });

  it('prefers what the server says over the stored copy, and re-caches it', async () => {
    const renamed = { ...session.user, name: 'Renamed Elsewhere' };
    await secureStorage.set(STORAGE_KEYS.refreshToken, 'refresh-1');
    await secureStorage.set(STORAGE_KEYS.user, JSON.stringify(session.user));
    mockedApi.me.mockResolvedValue(renamed);

    await useAuthStore.getState().restore();

    expect(useAuthStore.getState().user).toEqual(renamed);
    expect(JSON.parse((await secureStorage.get(STORAGE_KEYS.user))!)).toEqual(renamed);
  });

  it('still signs out when the server actually refuses the session', async () => {
    await secureStorage.set(STORAGE_KEYS.refreshToken, 'refresh-1');
    await secureStorage.set(STORAGE_KEYS.user, JSON.stringify(session.user));
    const refused = new ApiRequestError(401, 'UNAUTHORIZED', 'Your session has expired');
    mockedApi.me.mockRejectedValue(refused);
    mockedApi.refresh.mockRejectedValue(refused);

    await useAuthStore.getState().restore();

    expect(useAuthStore.getState().user).toBeNull();
    expect(await secureStorage.get(STORAGE_KEYS.user)).toBeNull();
  });

  it('does not invent a session from a stored user with no refresh token', async () => {
    await secureStorage.set(STORAGE_KEYS.user, JSON.stringify(session.user));

    await useAuthStore.getState().restore();

    expect(useAuthStore.getState().user).toBeNull();
    expect(mockedApi.me).not.toHaveBeenCalled();
  });

  it('ignores a stored user that is not a user', async () => {
    await secureStorage.set(STORAGE_KEYS.refreshToken, 'refresh-1');
    await secureStorage.set(STORAGE_KEYS.user, 'not json at all');
    mockedApi.me.mockRejectedValue(new ApiRequestError(0, 'NETWORK', 'Cannot reach the server.'));

    await useAuthStore.getState().restore();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isReady).toBe(true);
  });

  it('stores the user on sign in, so the next launch has one to restore', async () => {
    mockedApi.login.mockResolvedValue(session);

    await useAuthStore.getState().signIn('naman@example.com', 'CorrectHorse9');

    expect(JSON.parse((await secureStorage.get(STORAGE_KEYS.user))!)).toEqual(session.user);
  });

  it('leaves nothing behind on sign out', async () => {
    mockedApi.login.mockResolvedValue(session);
    mockedApi.logout.mockResolvedValue(undefined);
    await useAuthStore.getState().signIn('naman@example.com', 'CorrectHorse9');

    await useAuthStore.getState().signOut();

    expect(await secureStorage.get(STORAGE_KEYS.user)).toBeNull();
  });
});

describe('auth store', () => {
  it('persists both tokens on sign in', async () => {
    mockedApi.login.mockResolvedValue(session);

    await useAuthStore.getState().signIn('naman@example.com', 'CorrectHorse9');

    expect(useAuthStore.getState().user?.email).toBe('naman@example.com');
    expect(await secureStorage.get(STORAGE_KEYS.refreshToken)).toBe('refresh-1');
  });

  it('clears local state on sign out even if the API call fails', async () => {
    mockedApi.login.mockResolvedValue(session);
    mockedApi.logout.mockRejectedValue(new Error('offline'));
    await useAuthStore.getState().signIn('naman@example.com', 'CorrectHorse9');

    await useAuthStore.getState().signOut();

    expect(useAuthStore.getState().user).toBeNull();
    expect(await secureStorage.get(STORAGE_KEYS.refreshToken)).toBeNull();
  });

  it('shares one in-flight refresh between concurrent callers', async () => {
    useAuthStore.setState({ refreshToken: 'refresh-1' });
    mockedApi.refresh.mockResolvedValue({
      ...session,
      tokens: { accessToken: 'access-2', refreshToken: 'refresh-2', expiresIn: 900 },
    });

    const [a, b] = await Promise.all([
      useAuthStore.getState().refreshSession(),
      useAuthStore.getState().refreshSession(),
    ]);

    expect(mockedApi.refresh).toHaveBeenCalledTimes(1);
    expect(a).toBe('access-2');
    expect(b).toBe('access-2');
  });

  it('drops the session when the server rejects the refresh token', async () => {
    useAuthStore.setState({ refreshToken: 'refresh-1', accessToken: 'access-1' });
    // What `client.ts` actually throws on a 401, rather than a bare Error:
    // the distinction between this and an unreachable server is the whole
    // point of the branch below.
    mockedApi.refresh.mockRejectedValue(
      new ApiRequestError(401, 'INVALID_REFRESH_TOKEN', 'That session has expired'),
    );

    const result = await useAuthStore.getState().refreshSession();

    expect(result).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });

  it('keeps the session when the server cannot be reached', async () => {
    useAuthStore.setState({ refreshToken: 'refresh-1', accessToken: 'access-1' });
    await secureStorage.set(STORAGE_KEYS.refreshToken, 'refresh-1');
    // A refresh is a POST, so the client never retries it on a cold start.
    // Treating one dropped round trip as a rejection used to wipe the keychain
    // and sign the user out for good, on no evidence at all.
    mockedApi.refresh.mockRejectedValue(
      new ApiRequestError(0, 'NETWORK', 'Cannot reach the server. Check your connection.'),
    );

    const result = await useAuthStore.getState().refreshSession();

    expect(result).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBe('refresh-1');
    expect(await secureStorage.get(STORAGE_KEYS.refreshToken)).toBe('refresh-1');
  });

  it('keeps the session when the refresh endpoint is failing', async () => {
    useAuthStore.setState({ refreshToken: 'refresh-1', accessToken: 'access-1' });
    mockedApi.refresh.mockRejectedValue(new ApiRequestError(503, 'UNAVAILABLE', 'Try later'));

    expect(await useAuthStore.getState().refreshSession()).toBeNull();
    // A server having a bad day is not the user's session being invalid.
    expect(useAuthStore.getState().refreshToken).toBe('refresh-1');
  });
});
