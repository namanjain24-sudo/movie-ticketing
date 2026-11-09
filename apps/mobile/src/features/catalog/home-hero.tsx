import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Text } from '../../components/ui';
import { usePressScale } from '../../lib/use-press-scale';
import { useTheme } from '../../theme';
import { HIT_SIZE } from '../../theme/tokens';
import { whenItIs } from './greeting';

/**
 * The top of the home screen, as type rather than as artwork.
 *
 * Every reference app for this product opens with a photograph, and this one
 * cannot: the catalogue's posters are Wikipedia fair-use files 260 to 283
 * pixels wide, which a phone upscales about three times. A full-bleed hero
 * built on one of those is a blurred hero, and no amount of layout fixes it.
 *
 * So the first thing on the screen is the largest type in the product saying
 * something true and specific, which is a direction rather than a
 * compromise: it works at any artwork resolution, and it is the only place
 * `displayLg` is used.
 *
 * The count is the real number of films the API returned, and it is absent
 * until there is one. "0 films on" while a request is in flight is both wrong
 * and discouraging, and an empty city is a sentence rather than a zero.
 */
export function HomeHero({
  city,
  count,
  onPressCity,
  now = new Date(),
}: {
  city?: string;
  count?: number;
  onPressCity: () => void;
  /** Injectable so the greeting can be tested at a fixed hour. */
  now?: Date;
}) {
  const { colors, radius, spacing } = useTheme();
  const press = usePressScale();

  const place = city ?? 'your city';

  return (
    <Animated.View
      entering={FadeInDown.duration(320)}
      style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
    >
      <Text variant="overline" tone="muted">
        {whenItIs(now).toUpperCase()}
      </Text>

      {/* Two lines by construction, not by wrapping: the count and the place
          are different facts and the line break is where the sentence turns. */}
      <Text variant="displayLg" accessibilityRole="header">
        {count === undefined ? (
          `What's on in\n${place}`
        ) : (
          <>
            <Text variant="displayLg" style={{ color: colors.primary }} numeric>
              {count}
            </Text>
            {` ${count === 1 ? 'film' : 'films'} on in\n${place}`}
          </>
        )}
      </Text>

      <Animated.View style={[press.style, { alignSelf: 'flex-start' }]}>
        <Pressable
          onPress={onPressCity}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          accessibilityRole="button"
          accessibilityLabel={city ? `Change city, currently ${city}` : 'Choose your city'}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            minHeight: HIT_SIZE - 10,
            paddingHorizontal: spacing.md,
            borderRadius: radius.full,
            backgroundColor: colors.primaryMuted,
          }}
        >
          <Ionicons name="location" size={14} color={colors.primary} />
          <Text variant="label" style={{ color: colors.primary }}>
            {city ?? 'Pick a city'}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.primary} />
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}
