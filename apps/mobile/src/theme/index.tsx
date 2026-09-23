import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { STORAGE_KEYS, secureStorage } from '../lib/storage';
import {
  darkColors,
  elevation,
  gradients,
  lightColors,
  radius,
  spacing,
  typography,
  type Colors,
} from './tokens';

export type ThemePreference = 'light' | 'dark' | 'system';

type Theme = {
  colors: Colors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  elevation: typeof elevation;
  gradients: typeof gradients;
  isDark: boolean;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  /**
   * True once the persisted preference has been read (or found absent).
   * Children render immediately regardless, on the `system` default — this
   * exists so `_layout.tsx` can hold the splash screen until the real
   * preference is in, the same way it already waits on auth restore, rather
   * than painting a frame in the wrong theme first.
   */
  themeReady: boolean;
};

const ThemeContext = createContext<Theme | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    secureStorage
      .get(STORAGE_KEYS.themePreference)
      .then((stored) => {
        if (cancelled) return;
        if (isThemePreference(stored)) setPreferenceState(stored);
      })
      .catch(() => {
        // No stored preference, or the platform's storage failed — the
        // `system` default is a perfectly good fallback either way.
      })
      .finally(() => {
        if (!cancelled) setThemeReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void secureStorage.set(STORAGE_KEYS.themePreference, next);
  }, []);

  const isDark = preference === 'system' ? scheme === 'dark' : preference === 'dark';

  const value = useMemo<Theme>(
    () => ({
      colors: isDark ? darkColors : lightColors,
      spacing,
      radius,
      typography,
      elevation,
      gradients,
      isDark,
      preference,
      setPreference,
      themeReady,
    }),
    [isDark, preference, setPreference, themeReady],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): Theme {
  const theme = use(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
}

export { spacing, radius, typography, elevation, gradients };
export type { Colors, Theme };
