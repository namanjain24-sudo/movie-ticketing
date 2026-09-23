import { Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * The dip-and-spring every pressable surface in the app answers the thumb
 * with. A timing curve on the way in, because the thumb is already there by
 * the time the card notices; a spring on the way out, because the finger is
 * a physical thing and the release overshoot is the whole tell that the tap
 * registered.
 */
export function usePressScale(amount = 0.035) {
  const pressed = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * amount }],
  }));

  return {
    style,
    onPressIn: () => {
      pressed.value = withTiming(1, { duration: 90 });
    },
    onPressOut: () => {
      pressed.value = withSpring(0, { damping: 14, stiffness: 320 });
    },
  };
}
