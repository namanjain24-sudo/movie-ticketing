import type { AuthResponse } from '@app/shared';
import { authApi } from '../../../api/auth';
import { secureStorage, STORAGE_KEYS } from '../../../lib/storage';
import { useAuthStore } from '../auth-store';

jest.mock('../../../api/auth');
jest.mock('../../../lib/storage', () => {
  const store = new Map<string, string>();
  return {
    STORAGE_KEYS: { accessToken: 'auth.accessToken', refreshToken: 'auth.refreshToken' },
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
  useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, isReady: false });
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

  it('drops the session when the refresh token is rejected', async () => {
    useAuthStore.setState({ refreshToken: 'refresh-1', accessToken: 'access-1' });
    mockedApi.refresh.mockRejectedValue(new Error('401'));

    const result = await useAuthStore.getState().refreshSession();

    expect(result).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });
});
