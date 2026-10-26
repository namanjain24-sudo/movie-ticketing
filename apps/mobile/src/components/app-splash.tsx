import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { motion } from '../theme/tokens';

/**
 * Matches app.json's native splash exactly (`backgroundColor` and
 * `splash-icon.png`), not `useTheme()`'s `chrome` token — the native splash
 * never changes for light mode, so this cannot either without a visible
 * colour jump at the handoff below.
 */
const SPLASH_BG = '#16161C';
const MIN_VISIBLE_MS = 450;

/**
 * Takes over from the native splash the instant JS can draw anything at all
 * (`_layout.tsx` hides the native one on mount, not on `ready`), so the swap
 * is invisible — same background, same mark — and then plays the one motion
 * the native splash cannot: a settle-in, held for a minimum beat so it is
 * never cut off by a `ready` that resolves in a few milliseconds, and never
 * held open an instant longer than that once it does.
 */
export function AppSplash({ ready, onHidden }: { ready: boolean; onHidden: () => void }) {
  const reducedMotion = useReducedMotion();
  const [minTimeDone, setMinTimeDone] = useState(false);
  const [mounted, setMounted] = useState(true);
  const opacity = useSharedValue(reducedMotion ? 1 : 0);
  const scale = useSharedValue(reducedMotion ? 1 : 0.92);

  useEffect(() => {
    const timer = setTimeout(() => setMinTimeDone(true), MIN_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, []);

  const canExit = ready && minTimeDone;

  // One effect owns both ends of this animation — entrance on mount (`canExit`
  // starts false), exit once `canExit` flips true — so there is exactly one
  // place `opacity`/`scale` are ever written from an effect.
  useEffect(() => {
    if (!canExit) {
      if (!reducedMotion) {
        opacity.value = withTiming(1, { duration: motion.duration.slow });
        scale.value = withSpring(1, { damping: 14, stiffness: 160 });
      }
      return;
    }

    const finish = () => {
      setMounted(false);
      onHidden();
    };
    if (reducedMotion) {
      finish();
      return;
    }
    opacity.value = withTiming(0, { duration: 180 });
    scale.value = withTiming(1.04, { duration: 180 }, (finished) => {
      if (finished) runOnJS(finish)();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canExit]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!mounted) return null;

  return (
    <Animated.View
      pointerEvents={canExit ? 'none' : 'auto'}
      style={[styles.fill, { backgroundColor: SPLASH_BG }, animatedStyle]}
    >
      <Image
        source={require('../../assets/images/splash-icon.png')}
        style={styles.mark}
        contentFit="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: { width: 76, height: 76 },
});
