import type { MovieSummary } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../theme';
import { useWatchlist } from './use-watchlist';

const AnimatedIonicons = Animated.createAnimatedComponent(Ionicons);

/**
 * A heart sat on a poster's corner. Glass-dark in both themes because it lives
 * on artwork, and artwork has no theme.
 */
export function SaveHeart({ movie }: { movie: MovieSummary }) {
  const { colors } = useTheme();
  const { isSaved, toggle } = useWatchlist();
  const saved = isSaved(movie.id);
  const pop = useSharedValue(1);

  // Only the moment of saving gets the pop — removing is a plain swap, the
  // same asymmetry the seat spring draws between choosing and letting go.
  useEffect(() => {
    if (saved)
      pop.value = withSequence(
        withTiming(1.35, { duration: 110 }),
        withTiming(1, { duration: 160 }),
      );
  }, [saved, pop]);

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

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
      <AnimatedIonicons
        name={saved ? 'heart' : 'heart-outline'}
        size={18}
        color={saved ? colors.primary : colors.onImage}
        style={popStyle}
      />
    </Pressable>
  );
}
