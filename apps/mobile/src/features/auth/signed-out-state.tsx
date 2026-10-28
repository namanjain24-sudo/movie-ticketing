import { usePathname } from 'expo-router';
import { EmptyState } from '../../components/query-state';
import { signInThenReturn } from './return-to';

/**
 * What a tab shows when it is somebody's own account and nobody is signed in.
 *
 * Browsing needs no account, so most of the app simply opens. Tickets and the
 * profile are not "most of the app" — they are not empty, they are not broken,
 * and they are not a wall either. They are a prompt, and the person arrives
 * back on this very tab once they have signed in.
 */
export function SignedOutState({
  title,
  message,
  icon,
}: {
  title: string;
  message: string;
  icon: Parameters<typeof EmptyState>[0]['icon'];
}) {
  const here = usePathname();
  return (
    <EmptyState
      icon={icon}
      title={title}
      message={message}
      action={{ label: 'Sign in', onPress: () => signInThenReturn(here) }}
    />
  );
}
