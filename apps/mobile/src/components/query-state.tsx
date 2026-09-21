import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, View } from 'react-native';
import { ApiRequestError } from '../api/client';
import { config } from '../lib/config';
import { useTheme } from '../theme';
import { Button, Text } from './ui';

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
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  const { colors, radius, spacing } = useTheme();
  const unreachable = error instanceof ApiRequestError && error.isNetworkError;

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
            gap: 2,
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

      {onRetry ? (
        <Button label="Try again" variant="secondary" fullWidth={false} onPress={onRetry} />
      ) : null}
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
