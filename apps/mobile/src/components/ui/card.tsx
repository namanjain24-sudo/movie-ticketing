import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme';

export function Card({
  children,
  style,
  /** Flat cards sit in a list; raised ones sit above the page. */
  raised = false,
  padded = true,
}: {
  children: ReactNode;
  style?: ViewStyle;
  raised?: boolean;
  padded?: boolean;
}) {
  const { colors, radius, spacing, elevation } = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.lg,
          padding: padded ? spacing.lg : 0,
          gap: padded ? spacing.sm : 0,
          overflow: 'hidden',
        },
        raised && elevation.card,
        style,
      ]}
    >
      {children}
    </View>
  );
}
