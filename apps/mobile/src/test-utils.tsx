import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react-native';
import { useState, type ReactElement, type ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { ThemeProvider } from './theme';

/**
 * Safe-area metrics for a notched phone.
 *
 * Supplied explicitly because the real provider measures a native view, which
 * never resolves under Jest — a component that reads insets would otherwise
 * hang on a frame of zeroes forever. These are an iPhone's: a top inset that
 * exists and a bottom one that matters, so a sheet padded against the home
 * indicator is exercised rather than skipped.
 */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

// Tracked so every client made for a test can be torn down after it — an
// unmounted `QueryClientProvider` does not itself stop the client's internal
// listeners, and a live one left running is exactly the kind of open handle
// that keeps the Jest process from exiting once the file is done.
const clients: QueryClient[] = [];

afterEach(() => {
  while (clients.length > 0) clients.pop()?.unmount();
});

function Providers({ children }: { children: ReactNode }) {
  // Fresh per render, not the app's own singleton: a shared cache would leak
  // query state between tests that otherwise have nothing to do with one
  // another. No retries — a test should fail fast, not wait out a backoff.
  const [client] = useState(() => {
    const created = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    clients.push(created);
    return created;
  });

  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={client}>
        <ThemeProvider>{children}</ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/**
 * `render`, with the providers every screen in this app is mounted under.
 *
 * Re-exported as a drop-in so a test never has to remember the wrapper — and
 * so a component that starts reading the theme or the insets does not turn
 * into a failing test in a file that has nothing to do with either.
 */
export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: Providers, ...options });
}

export * from '@testing-library/react-native';
export { renderWithProviders as render };
