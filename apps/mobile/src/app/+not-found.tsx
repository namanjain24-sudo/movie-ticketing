import { Link } from 'expo-router';
import { View } from 'react-native';
import { Screen, Text } from '../components/ui';
import { useTheme } from '../theme';

export default function NotFound() {
  const { spacing } = useTheme();
  return (
    <Screen edges={{ top: true, bottom: true }}>
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing.md }}>
        <Text variant="title">This screen does not exist</Text>
        <Link href="/">
          <Text tone="primary">Go to the home screen</Text>
        </Link>
      </View>
    </Screen>
  );
}
