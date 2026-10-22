import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { warmUpServer } from '../api/client';
import { AppSplash } from '../components/app-splash';
import { ErrorBoundary } from '../components/error-boundary';
import { AuthProvider, useAuth } from '../features/auth/auth-provider';
import { installNotificationHandler } from '../features/notifications/notifications';
import { OnboardingProvider, useOnboarding } from '../features/onboarding/onboarding-provider';
import { queryClient } from '../lib/query-client';
import { ThemeProvider, useTheme } from '../theme';

export { ErrorBoundary } from '../components/error-boundary';

void SplashScreen.preventAutoHideAsync();
installNotificationHandler();
// Fired at module load rather than from an effect: the point is to start the
// server waking as early as possible, and nothing renders before this runs.
warmUpServer();

function RootNavigator() {
  const { isReady } = useAuth();
  const { colors, isDark, themeReady } = useTheme();
  const onboarding = useOnboarding();
  const ready = isReady && themeReady && onboarding.ready;
  const [showAppSplash, setShowAppSplash] = useState(true);

  useEffect(() => {
    // Hidden the instant JS can draw anything at all, not once `ready` is
    // true: `AppSplash` below is pixel-identical to this native one, so the
    // swap has no visible seam, and the real wait (session, theme, intro)
    // happens entirely behind the app's own splash instead.
    void SplashScreen.hideAsync();
  }, []);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {ready ? (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="index" />
          {/* Fades rather than sliding: there is no screen behind it to slide off of. */}
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          {/* Owns a back button over its backdrop, so it keeps the header off. */}
          <Stack.Screen name="movie/[idOrSlug]/index" />
          {/* Both carry their own dark AppBar. */}
          <Stack.Screen name="movie/[idOrSlug]/reviews" />
          <Stack.Screen name="cinema/[idOrSlug]" />
          <Stack.Screen name="watchlist" />
          <Stack.Screen name="notifications" />
          {/* Both carry their own dark AppBar, so the stack header stays off. */}
          <Stack.Screen name="showtime/[id]" />
          <Stack.Screen name="checkout/[holdId]" />
          {/* No header and no back button: a confirmed ticket has nowhere to go
              back to, so it rises into place rather than sliding in from the
              side like a screen you could return from. */}
          <Stack.Screen name="booking/[reference]" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="+not-found" options={{ headerShown: true, title: 'Not found' }} />
        </Stack>
      ) : null}
      {showAppSplash ? <AppSplash ready={ready} onHidden={() => setShowAppSplash(false)} /> : null}
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
              <AuthProvider>
                <OnboardingProvider>
                  <RootNavigator />
                </OnboardingProvider>
              </AuthProvider>
            </QueryClientProvider>
          </ErrorBoundary>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
