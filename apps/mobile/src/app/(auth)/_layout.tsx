import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../features/auth/auth-provider';

export default function AuthLayout() {
  const { isSignedIn } = useAuth();
  if (isSignedIn) return <Redirect href="/(tabs)" />;

  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
