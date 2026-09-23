import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
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
 *
 * A light band sweeps across it rather than the whole shape pulsing — the
 * same shimmer every native app store and social feed settled on, because it
 * reads as "still working" instead of "something is wrong and flashing".
 */
export function Skeleton({ style }: { style?: ViewStyle }) {
  const { colors, radius, isDark } = useTheme();
  const progress = useSharedValue(0);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }, [progress]);

  const bandWidth = Math.max(width * 0.5, 1);
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [-bandWidth, width + bandWidth]) },
    ],
  }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[
        { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, overflow: 'hidden' },
        style,
      ]}
    >
      {width > 0 ? (
        <Animated.View style={[{ width: bandWidth, height: '100%' }, shimmerStyle]}>
          <LinearGradient
            colors={
              isDark
                ? ['rgba(255,255,255,0)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']
                : ['rgba(255,255,255,0)', 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0)']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ width: '100%', height: '100%' }}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
