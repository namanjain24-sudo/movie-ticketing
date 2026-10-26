import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { HIT_SIZE } from '../../theme/tokens';
import { ChromeSurface } from './chrome-surface';
import { Text } from './text';

/**
 * The top bar is dark in both themes. It anchors the app, keeps posters reading
 * against a neutral, and is the one place the product speaks in its own voice
 * rather than the page's.
 */
export function AppBar({
  title,
  subtitle,
  onPressTitle,
  onBack,
  actions,
  titleLines = 1,
}: {
  title: string;
  subtitle?: string;
  /** Present when the title is a control, such as the city selector. */
  onPressTitle?: () => void;
  onBack?: () => void;
  actions?: ReactNode;
  /**
   * Let a long title wrap instead of truncating. One line is right almost
   * everywhere — a title that needs two is usually a sign the screen is
   * carrying too much — but a bar with a back arrow, a title, a subtitle, an
   * icon and a date block has roughly 190pt left for the title, and a film
   * name does not fit in it. Two lines there beats "Drishyam: The Conclu…".
   */
  titleLines?: 1 | 2;
}) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const heading = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
      {/* Shrinkable, so a long cinema name gives way to the actions on the
          right instead of running underneath them. */}
      <View style={{ flexShrink: 1 }}>
        {subtitle ? (
          <Text variant="caption" numberOfLines={1} style={{ color: colors.onChromeMuted }}>
            {subtitle}
          </Text>
        ) : null}
        <Text variant="heading" tone="onChrome" numberOfLines={titleLines}>
          {title}
        </Text>
      </View>
      {onPressTitle ? <Ionicons name="chevron-down" size={16} color={colors.onChrome} /> : null}
    </View>
  );

  return (
    <ChromeSurface
      style={{
        paddingTop: insets.top + spacing.sm,
        paddingBottom: spacing.md,
        paddingHorizontal: spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
      }}
    >
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={onBack}
          hitSlop={8}
          style={{ width: 32, height: HIT_SIZE, justifyContent: 'center' }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.onChrome} />
        </Pressable>
      ) : null}

      <View style={{ flex: 1, minWidth: 0 }}>
        {onPressTitle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Change location, currently ${title}`}
            onPress={onPressTitle}
            hitSlop={8}
          >
            {heading}
          </Pressable>
        ) : (
          heading
        )}
      </View>

      {actions}
    </ChromeSurface>
  );
}
