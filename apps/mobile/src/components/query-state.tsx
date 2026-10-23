import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { ApiRequestError } from '../api/client';
import { config } from '../lib/config';
import { useTheme } from '../theme';
import { Button } from './ui/button';
import { Text } from './ui/text';

/** Centred spinner for a screen whose data has not arrived yet. */
export function LoadingState({ label }: { label?: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md }}>
      <ActivityIndicator color={colors.primary} />
      {label ? (
        <Text tone="muted" variant="caption">
          {label}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A failed query, said in the user's terms. A dropped connection is the common
 * case on a phone and is worth naming, because the fix is theirs to make.
 *
 * When the server cannot be reached at all we also print the address that was
 * tried. In development that one line is usually the whole diagnosis: it says
 * whether the app is talking to the machine the API is running on, which is
 * otherwise invisible from inside the bundle.
 */
export function ErrorState({
  error,
  onRetry,
  title = 'Something went wrong',
  exit = true,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  /**
   * Whether to offer a way out as well as a way to retry. On by default,
   * because the screens that fail hardest are the deep-linkable ones.
   */
  exit?: boolean;
}) {
  const { colors, radius, spacing } = useTheme();
  const unreachable = error instanceof ApiRequestError && error.isNetworkError;

  /**
   * Every screen that renders this has `headerShown: false`, so when the error
   * replaces the screen's own chrome there is no back button left on it. That
   * is survivable when the user walked here, and a dead end when they did not:
   * a shared ticket link opens `booking/[reference]` as the only entry in the
   * stack, and if the reference is stale or belongs to somebody else the
   * result used to be a full-screen error with a "Try again" that could never
   * succeed and nothing behind it to swipe back to. Force quitting was the
   * only way out.
   */
  const canGoBack = router.canGoBack();
  const leave = () => (canGoBack ? router.back() : router.replace('/'));

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.xl,
      }}
    >
      <Text variant="heading" align="center">
        {unreachable ? 'Cannot reach the server' : title}
      </Text>
      <Text tone="muted" align="center">
        {error instanceof ApiRequestError ? error.message : 'Please try again in a moment.'}
      </Text>

      {unreachable && __DEV__ ? (
        <View
          style={{
            backgroundColor: colors.surfaceMuted,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            gap: spacing['2xs'],
            alignSelf: 'stretch',
          }}
        >
          <Text variant="overline" tone="muted">
            TRIED
          </Text>
          <Text variant="caption" numeric selectable>
            {config.apiUrl}
          </Text>
          <Text variant="caption" tone="muted">
            {config.apiUrlSource === 'dev-server'
              ? 'Address taken from the Expo dev server. Start the API with `npm run api`.'
              : config.apiUrlSource === 'env'
                ? 'Address from EXPO_PUBLIC_API_URL.'
                : 'No dev server host available; fell back to loopback.'}
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing['2xs'] }}>
        {onRetry ? (
          <Button label="Try again" variant="secondary" fullWidth={false} onPress={onRetry} />
        ) : null}
        {exit ? (
          <Button
            label={canGoBack ? 'Go back' : 'Go to home'}
            variant="ghost"
            fullWidth={false}
            onPress={leave}
          />
        ) : null}
      </View>
    </View>
  );
}

/** Nothing to show, and nothing broken. Distinct from an error on purpose. */
export function EmptyState({
  title,
  message,
  action,
  icon,
}: {
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
  /** Drawn in a soft disc above the title, so an empty screen still has a subject. */
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing['3xl'],
        paddingHorizontal: spacing.xl,
      }}
    >
      {icon ? (
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            marginBottom: spacing.sm,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceMuted,
          }}
        >
          <Ionicons name={icon} size={38} color={colors.textMuted} />
        </View>
      ) : null}
      <Text variant="heading" align="center">
        {title}
      </Text>
      {message ? (
        <Text tone="muted" align="center">
          {message}
        </Text>
      ) : null}
      {action ? (
        // Its own centring box: a button that is not full width sizes to its
        // label and would otherwise sit on the left edge of the column.
        <View style={{ marginTop: spacing.sm, alignSelf: 'center' }}>
          <Button
            label={action.label}
            variant="secondary"
            fullWidth={false}
            onPress={action.onPress}
          />
        </View>
      ) : null}
    </View>
  );
}
