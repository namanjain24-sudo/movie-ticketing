import { act, renderHook, waitFor } from '@testing-library/react-native';
import { secureStorage } from '../../../lib/storage';
import { OnboardingProvider, useOnboarding } from '../onboarding-provider';

jest.mock('../../../lib/storage', () => {
  const store = new Map<string, string>();
  return {
    STORAGE_KEYS: { onboardingSeen: 'onboarding.seen' },
    secureStorage: {
      get: jest.fn(async (k: string) => store.get(k) ?? null),
      set: jest.fn(async (k: string, v: string) => void store.set(k, v)),
      remove: jest.fn(async (k: string) => void store.delete(k)),
    },
  };
});

const KEY = 'onboarding.seen';

beforeEach(async () => {
  jest.clearAllMocks();
  await secureStorage.remove(KEY);
});

/**
 * Rendered through the provider, not the bare hook: a previous version of
 * this hook read storage independently at every call site, which meant
 * `index.tsx`'s own copy was still mid-flight (defaulting to unseen) by the
 * time it rendered its redirect decision — sending a user who had already
 * finished the intro back to it on every reload. The provider is what makes
 * `ready`/`seen` a single, shared answer; these tests go through it so a
 * regression back to the per-call-site version would be caught here too, via
 * `useOnboarding` throwing outside it.
 */
function renderOnboarding() {
  return renderHook(() => useOnboarding(), { wrapper: OnboardingProvider });
}

describe('useOnboarding', () => {
  it('throws outside the provider, rather than silently defaulting', async () => {
    await expect(renderHook(() => useOnboarding())).rejects.toThrow(
      'useOnboarding must be used inside <OnboardingProvider>',
    );
  });

  it('is not ready until the stored value has been read', async () => {
    const { result } = await renderOnboarding();
    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it('defaults to unseen with nothing stored', async () => {
    const { result } = await renderOnboarding();
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.seen).toBe(false);
  });

  it('marks the intro seen, and persists it', async () => {
    const { result } = await renderOnboarding();
    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => result.current.complete());
    expect(result.current.seen).toBe(true);
    expect(await secureStorage.get(KEY)).toBe('true');
  });

  it('starts seen on a later mount, once persisted', async () => {
    await secureStorage.set(KEY, 'true');

    const { result } = await renderOnboarding();
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.seen).toBe(true);
  });
});
