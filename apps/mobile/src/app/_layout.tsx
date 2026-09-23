import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '../components/error-boundary';
import { AuthProvider, useAuth } from '../features/auth/auth-provider';
import { installNotificationHandler } from '../features/notifications/notifications';
import { queryClient } from '../lib/query-client';
import { ThemeProvider, useTheme } from '../theme';

export { ErrorBoundary } from '../components/error-boundary';

void SplashScreen.preventAutoHideAsync();
installNotificationHandler();

function RootNavigator() {
  const { isReady } = useAuth();
  const { colors, isDark, themeReady } = useTheme();
  const ready = isReady && themeReady;

  useEffect(() => {
    // Hold the splash until the stored session and the stored theme
    // preference have both been read, so the user never sees the sign-in
    // screen — or the wrong theme — flash before landing on the app.
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        {/* Owns a back button over its backdrop, so it keeps the header off. */}
        <Stack.Screen name="movie/[idOrSlug]/index" />
        {/* Both carry their own dark AppBar. */}
        <Stack.Screen name="movie/[idOrSlug]/reviews" />
        <Stack.Screen name="cinema/[idOrSlug]" />
        <Stack.Screen name="watchlist" />
        {/* Both carry their own dark AppBar, so the stack header stays off. */}
        <Stack.Screen name="showtime/[id]" />
        <Stack.Screen name="checkout/[holdId]" />
        {/* No header and no back button: a confirmed ticket has nowhere to go
            back to, so it rises into place rather than sliding in from the
            side like a screen you could return from. */}
        <Stack.Screen name="booking/[reference]" options={{ animation: 'fade_from_bottom' }} />
        <Stack.Screen name="+not-found" options={{ headerShown: true, title: 'Not found' }} />
      </Stack>
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
                <RootNavigator />
              </AuthProvider>
            </QueryClientProvider>
          </ErrorBoundary>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
