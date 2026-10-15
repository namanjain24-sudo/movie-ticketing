import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';
import { Badge, Card, Text } from '../../components/ui';
import { tapFeedback } from '../../lib/haptics';
import { AnimatedPressable, usePressScale } from '../../lib/use-press-scale';
import { useTheme } from '../../theme';
import { gradients } from '../../theme/tokens';

type SponsoredContent = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  onPress: () => void;
};

/**
 * The one house-ad shape in the app: always labelled "Sponsored", always
 * built from the same `Card`/`Badge` chrome a browse screen already uses —
 * a promoted tile reads as the app's own voice rather than a bolted-on
 * banner. Placed only on browse surfaces (home, cinemas, the similar-films
 * rail, past bookings); never on checkout or the seat map, where DESIGN.md's
 * countdown principle means nothing should compete with the clock.
 */
export function SponsoredCard({ icon, title, body, onPress }: SponsoredContent) {
  const { colors, radius, spacing } = useTheme();
  const press = usePressScale();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`Sponsored. ${title}. ${body}`}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={press.style}
    >
      <Card raised style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <LinearGradient
          colors={gradients.accent}
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={20} color={colors.onImage} />
        </LinearGradient>

        <View style={{ flex: 1, gap: spacing['2xs'] }}>
          <Badge label="Sponsored" variant="outline" />
          <Text variant="label" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {body}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={18} color={colors.borderStrong} />
      </Card>
    </AnimatedPressable>
  );
}

/** Same slot, sized and lit to sit beside a poster in a horizontal rail. */
export function SponsoredTile({
  width,
  icon,
  title,
  body,
  onPress,
}: SponsoredContent & { width: number }) {
  const { radius, spacing, elevation } = useTheme();
  const press = usePressScale();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`Sponsored. ${title}. ${body}`}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[{ width }, press.style]}
    >
      <LinearGradient
        colors={gradients.accent}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          {
            aspectRatio: 2 / 3,
            borderRadius: radius.lg,
            padding: spacing.md,
            justifyContent: 'space-between',
          },
          elevation.card,
        ]}
      >
        <Badge label="Sponsored" tone="onImage" />
        <View style={{ gap: spacing['2xs'] }}>
          <Ionicons name={icon} size={18} color="#FFFFFF" />
          <Text variant="label" numberOfLines={2} style={{ color: '#FFFFFF' }}>
            {title}
          </Text>
          <Text variant="caption" numberOfLines={2} style={{ color: 'rgba(255,255,255,0.78)' }}>
            {body}
          </Text>
        </View>
      </LinearGradient>
    </AnimatedPressable>
  );
}
