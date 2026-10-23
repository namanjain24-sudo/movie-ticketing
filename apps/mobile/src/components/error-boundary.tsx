import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Screen, Text } from './ui';

type Props = {
  children?: ReactNode;
  /** Set by expo-router when it uses this as a route's catch component. */
  error?: Error;
  retry?: () => void | Promise<unknown>;
};
type State = { error: Error | null };

/**
 * Catches render-time crashes so a bad screen shows a recovery path instead of
 * a white screen. Wire `componentDidCatch` to Sentry when you add it.
 *
 * This has to work two ways, because it is used two ways.
 *
 * Mounted as a wrapper (`<ErrorBoundary>{children}</ErrorBoundary>` in
 * `_layout.tsx`) it behaves like any React error boundary: children render
 * until one of them throws.
 *
 * Exported by name from a route file, expo-router treats it as that route's
 * *catch component* and renders `<ErrorBoundary error={…} retry={…} />` with
 * **no children at all** (see expo-router's `views/Try.js`). Returning
 * `this.props.children` in that mode returns `undefined`, which React renders
 * as nothing: every crash expo-router caught produced a blank screen instead
 * of this fallback, and `componentDidCatch` never ran, so nothing was logged
 * either. Reading the `error` prop as well as our own state fixes both.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error', error, info.componentStack);
  }

  override componentDidMount() {
    // In catch-component mode the crash already happened upstream, so this is
    // the only place it can be logged.
    if (this.props.error) console.error('Unhandled render error', this.props.error);
  }

  private reset = () => {
    this.setState({ error: null });
    // Whoever caught it owns the remount; ours is a no-op when we did.
    void this.props.retry?.();
  };

  override render() {
    const error = this.props.error ?? this.state.error;
    if (!error) return this.props.children ?? null;

    return (
      <Screen edges={{ top: true, bottom: true }}>
        <View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
          <Text variant="title">Something broke</Text>
          <Text tone="muted">
            The screen failed to render. Try again, and if it keeps happening, restart the app.
          </Text>
          <Text variant="caption" tone="muted">
            {error.message}
          </Text>
          <Button label="Try again" onPress={this.reset} />
        </View>
      </Screen>
    );
  }
}
