import {
  ActivityIndicator,
  StyleSheet,
  View,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import { tapFeedback } from '../../lib/haptics';
import { AnimatedPressable, usePressScale } from '../../lib/use-press-scale';
import { useTheme } from '../../theme';
import { HIT_SIZE } from '../../theme/tokens';
import { Text } from './text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';
/**
 * `commit` is the shouting treatment, reserved for the action that spends the
 * user's money. Spending it on "Sign in" and "Save changes" is what makes it
 * stop meaning anything by the time the user reaches Pay.
 */
type Emphasis = 'normal' | 'commit';

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  emphasis?: Emphasis;
  /** Marks a ghost action that takes something away, such as cancelling. */
  destructive?: boolean;
  style?: ViewStyle;
};

const HEIGHT: Record<Size, number> = { sm: HIT_SIZE, md: 48, lg: 52 };

export function Button({
  label,
  variant = 'primary',
  size = 'lg',
  loading = false,
  fullWidth = true,
  emphasis = 'normal',
  destructive = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const { colors, radius, spacing } = useTheme();
  const isDisabled = disabled || loading;
  const press = usePressScale();

  const background: Record<Variant, string> = {
    primary: colors.primary,
    secondary: colors.surfaceMuted,
    ghost: 'transparent',
    danger: colors.danger,
  };
  // A ghost button is quiet by default. Painting every one of them with the
  // accent is how the accent stops meaning "this is the thing you press".
  const labelTone =
    variant === 'primary' || variant === 'danger'
      ? 'inverse'
      : variant === 'ghost' && destructive
        ? 'danger'
        : 'default';

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(isDisabled), busy: loading }}
      disabled={isDisabled}
      {...rest}
      onPressIn={(e) => {
        if (!isDisabled) press.onPressIn();
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        press.onPressOut();
        rest.onPressOut?.(e);
      }}
      onPress={(e) => {
        if (!isDisabled) tapFeedback();
        rest.onPress?.(e);
      }}
      style={({ pressed: isPressed }: { pressed: boolean }) => [
        styles.base,
        {
          backgroundColor:
            isPressed && variant === 'primary' ? colors.primaryPressed : background[variant],
          borderRadius: radius.md,
          paddingHorizontal: spacing.lg,
          minHeight: HEIGHT[size],
          borderWidth: variant === 'ghost' ? 1 : 0,
          borderColor: colors.border,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: isDisabled ? 0.45 : 1,
        },
        press.style,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator
            color={labelTone === 'inverse' ? colors.onPrimary : colors.text}
            size="small"
          />
        ) : (
          <Text
            variant={size === 'sm' ? 'label' : 'heading'}
            tone={labelTone}
            style={emphasis === 'commit' ? styles.shout : undefined}
          >
            {label}
          </Text>
        )}
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: { justifyContent: 'center', alignItems: 'center' },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // The one shouting element on a screen: the action that commits money.
  shout: { textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '800' },
});
