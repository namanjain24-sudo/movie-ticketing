import { Link } from 'expo-router';
import { View } from 'react-native';
import { Screen, Text } from '../components/ui';

export default function NotFound() {
  return (
    <Screen edges={{ top: true, bottom: true }}>
      <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
        <Text variant="title">This screen does not exist</Text>
        <Link href="/">
          <Text tone="primary">Go to the home screen</Text>
        </Link>
      </View>
    </Screen>
  );
}
