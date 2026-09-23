import { View, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme';
import { Text } from './text';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'onImage';

type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  /** Filled badges carry meaning; outlined ones are metadata. */
  variant?: 'soft' | 'outline';
  style?: ViewStyle;
};

export function Badge({ label, tone = 'neutral', variant = 'soft', style }: BadgeProps) {
  const { colors, radius, spacing, isDark } = useTheme();

  // In dark mode there are no tinted surfaces to spare, so a soft badge becomes
  // a muted fill with a coloured label rather than a coloured wash.
  const fill: Record<BadgeTone, string> = {
    neutral: colors.surfaceMuted,
    primary: isDark ? colors.surfaceMuted : colors.primaryMuted,
    success: isDark ? colors.surfaceMuted : colors.successMuted,
    warning: isDark ? colors.surfaceMuted : colors.warningMuted,
    onImage: colors.onImageScrim,
  };

  const ink: Record<BadgeTone, string> = {
    neutral: colors.textMuted,
    primary: colors.primary,
    success: colors.success,
    warning: colors.warning,
    onImage: colors.onImage,
  };

  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          paddingHorizontal: spacing.sm,
          paddingVertical: 3,
          borderRadius: radius.sm,
          backgroundColor: variant === 'soft' ? fill[tone] : 'transparent',
          borderWidth: variant === 'outline' ? 1 : 0,
          borderColor: colors.borderStrong,
        },
        style,
      ]}
    >
      <Text
        variant="overline"
        style={{ color: variant === 'outline' ? colors.textMuted : ink[tone] }}
      >
        {label.toUpperCase()}
      </Text>
    </View>
  );
}
