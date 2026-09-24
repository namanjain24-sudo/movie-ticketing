import { Alert, Platform } from 'react-native';

/**
 * A one-off informational alert. React Native's `Alert` is a no-op on web,
 * so that platform gets the browser's own `alert` instead.
 */
export function notify(title: string, body: string) {
  if (Platform.OS === 'web') {
    globalThis.alert(`${title}\n\n${body}`);
    return;
  }
  Alert.alert(title, body);
}
