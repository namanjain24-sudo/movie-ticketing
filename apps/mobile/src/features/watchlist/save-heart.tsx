import type { MovieSummary } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable } from 'react-native';
import { useTheme } from '../../theme';
import { useWatchlist } from './use-watchlist';

/**
 * A heart sat on a poster's corner. Glass-dark in both themes because it lives
 * on artwork, and artwork has no theme.
 */
export function SaveHeart({ movie }: { movie: MovieSummary }) {
  const { colors } = useTheme();
  const { isSaved, toggle } = useWatchlist();
  const saved = isSaved(movie.id);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={saved ? `Remove ${movie.title} from saved` : `Save ${movie.title}`}
      accessibilityState={{ selected: saved }}
      hitSlop={8}
      onPress={() => toggle(movie)}
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.onImageScrim,
      }}
    >
      <Ionicons
        name={saved ? 'heart' : 'heart-outline'}
        size={18}
        color={saved ? colors.primary : colors.onImage}
      />
    </Pressable>
  );
}
