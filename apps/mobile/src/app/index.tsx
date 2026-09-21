import { Redirect } from 'expo-router';
import { useAuth } from '../features/auth/auth-provider';

/** Entry point: send the user to the app or to sign-in. */
export default function Index() {
  const { isSignedIn } = useAuth();
  return <Redirect href={isSignedIn ? '/(tabs)' : '/(auth)/sign-in'} />;
}
