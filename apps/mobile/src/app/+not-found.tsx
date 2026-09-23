import { useRouter } from 'expo-router';
import { EmptyState } from '../components/query-state';
import { Screen } from '../components/ui';

export default function NotFound() {
  const router = useRouter();
  return (
    <Screen edges={{ top: true, bottom: true }}>
      <EmptyState
        icon="compass-outline"
        title="This screen does not exist"
        message="The link may be broken, or the page may have moved."
        action={{ label: 'Go to home', onPress: () => router.replace('/') }}
      />
    </Screen>
  );
}
