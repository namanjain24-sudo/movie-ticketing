import { Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { motion } from '../theme/tokens';

export const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * The dip-and-spring every pressable surface in the app answers the thumb
 * with. A timing curve on the way in, because the thumb is already there by
 * the time the card notices; a spring on the way out, because the finger is
 * a physical thing and the release overshoot is the whole tell that the tap
 * registered.
 */
export function usePressScale(amount = motion.pressScale) {
  const pressed = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * amount }],
  }));

  return {
    style,
    onPressIn: () => {
      pressed.value = withTiming(1, { duration: motion.duration.fast });
    },
    onPressOut: () => {
      pressed.value = withSpring(0, motion.spring.press);
    },
  };
}
