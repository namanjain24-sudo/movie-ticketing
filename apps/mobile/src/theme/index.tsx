import { createContext, use, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
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

type Theme = {
  colors: Colors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  elevation: typeof elevation;
  gradients: typeof gradients;
  isDark: boolean;
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const value = useMemo<Theme>(
    () => ({
      colors: isDark ? darkColors : lightColors,
      spacing,
      radius,
      typography,
      elevation,
      gradients,
      isDark,
    }),
    [isDark],
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
