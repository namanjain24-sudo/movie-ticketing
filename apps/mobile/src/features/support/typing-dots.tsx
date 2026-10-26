import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../theme';

const DOT = 6;
const STEP_MS = 320;

function Dot({ index, reduced }: { index: number; reduced: boolean }) {
  const { colors } = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    progress.value = withDelay(
      index * (STEP_MS / 2),
      withRepeat(
        withSequence(
          withTiming(1, { duration: STEP_MS, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: STEP_MS, easing: Easing.in(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
  }, [index, progress, reduced]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + progress.value * 0.65,
    transform: [{ translateY: -progress.value * 3 }],
  }));

  return (
    <Animated.View
      style={[
        { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: colors.textMuted },
        style,
      ]}
    />
  );
}

/**
 * The three dots, while the agent is thinking.
 *
 * Worth animating rather than spinning a generic `ActivityIndicator`: the wait
 * here is a second or two of somebody else composing a sentence, and a travelling
 * ripple reads as exactly that in a way a spinner — which this app uses for
 * network work — does not.
 *
 * Still, it stops dead under reduce-motion: a looping animation is precisely
 * what that setting exists to switch off, and three static dots still say
 * "waiting".
 */
export function TypingDots() {
  const { colors, radius, spacing } = useTheme();
  const reduced = useReducedMotion();

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="The assistant is typing"
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      {[0, 1, 2].map((i) => (
        <Dot key={i} index={i} reduced={reduced} />
      ))}
    </View>
  );
}
