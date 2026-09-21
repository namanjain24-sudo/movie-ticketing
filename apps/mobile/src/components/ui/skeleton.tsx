import { useEffect } from 'react';
import type { ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../theme';

/**
 * A placeholder shaped like the thing that is coming. A spinner says "wait"; a
 * skeleton says what you are waiting for, which is the difference between a
 * blank screen and a screen that is loading.
 */
export function Skeleton({ style }: { style?: ViewStyle }) {
  const { colors, radius } = useTheme();
  const progress = useSharedValue(0.5);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [progress]);

  const animated = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ backgroundColor: colors.surfaceMuted, borderRadius: radius.md }, animated, style]}
    />
  );
}
