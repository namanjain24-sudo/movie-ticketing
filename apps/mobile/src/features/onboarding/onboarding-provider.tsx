import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { STORAGE_KEYS, secureStorage } from '../../lib/storage';

type Onboarding = {
  /** True once the persisted "has the intro run" flag has been read. */
  ready: boolean;
  seen: boolean;
  complete: () => void;
};

const OnboardingContext = createContext<Onboarding | null>(null);

/**
 * A `Context` provider, not a plain hook, on purpose: `_layout.tsx` and
 * `index.tsx` both need to know whether the intro has been seen, and a plain
 * `useState`-backed hook would give each call site its own independent read
 * of storage. `index.tsx`'s copy would still be mid-flight (defaulting to
 * `seen: false`) by the time it renders its redirect decision — which is
 * exactly what sent a user who had already finished the intro back to it on
 * every reload. One provider, read once, shared — the same shape
 * `ThemeProvider` uses for the same reason.
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [seen, setSeen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // `ready` gates the navigator alongside auth and theme, so it has to be
    // set on every outcome. A rejected read here used to hold the splash
    // screen open indefinitely.
    void secureStorage
      .get(STORAGE_KEYS.onboardingSeen)
      .then((raw) => {
        if (!cancelled) setSeen(raw === 'true');
      })
      .catch(() => {
        // Unreadable means unseen: showing the intro twice is a far smaller
        // cost than never getting past it.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const complete = useCallback(() => {
    setSeen(true);
    void secureStorage.set(STORAGE_KEYS.onboardingSeen, 'true');
  }, []);

  const value = useMemo<Onboarding>(() => ({ ready, seen, complete }), [ready, seen, complete]);

  return <OnboardingContext value={value}>{children}</OnboardingContext>;
}

export function useOnboarding(): Onboarding {
  const onboarding = use(OnboardingContext);
  if (!onboarding) throw new Error('useOnboarding must be used inside <OnboardingProvider>');
  return onboarding;
}
