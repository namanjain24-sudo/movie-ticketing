import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Screen, Text } from './ui';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Catches render-time crashes so a bad screen shows a recovery path instead of
 * a white screen. Wire `componentDidCatch` to Sentry when you add it.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error', error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

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
          <Button label="Try again" onPress={() => this.setState({ error: null })} />
        </View>
      </Screen>
    );
  }
}
