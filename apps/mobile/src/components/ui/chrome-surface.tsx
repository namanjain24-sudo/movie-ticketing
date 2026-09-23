import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Platform, View, type ViewProps } from 'react-native';
import { useTheme } from '../../theme';

/**
 * iOS only, and only where the Liquid Glass API actually exists — computed
 * once, since availability cannot change while the app is running.
 */
const useGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

/**
 * The app bar's dark chrome, rendered as real frosted glass where the
 * platform offers it, and as the same solid `colors.chrome` everywhere else
 * (Android, web, older iOS). DESIGN.md already frames the chrome as
 * something that should read like emitted light rather than paint —
 * `expo-glass-effect` was sitting in package.json, installed and unused,
 * as the literal version of that idea.
 */
export function ChromeSurface({ style, ...rest }: ViewProps) {
  const { colors } = useTheme();
  if (useGlass) {
    return (
      <GlassView glassEffectStyle="regular" tintColor={colors.chrome} style={style} {...rest} />
    );
  }
  return <View style={[{ backgroundColor: colors.chrome }, style]} {...rest} />;
}
