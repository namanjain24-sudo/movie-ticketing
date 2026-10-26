import type { PromoOffer } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ScrollView, View } from 'react-native';
import { Text } from '../../components/ui';
import { useTheme } from '../../theme';
import { SectionHeader } from '../catalog/section-header';

/**
 * What the user can save right now, above the film grid. Informational: a code
 * is applied at checkout, where there is a price for it to change, so the cards
 * say where to use it rather than pretending to be buttons that do nothing.
 *
 * Which is why they are a tinted surface rather than a filled one. They used
 * to carry `gradients.accent` edge to edge, and two saturated violet blocks
 * were measurably the loudest thing on the home screen — louder than the
 * hero's Book tickets, which is the only control on that page that does
 * anything. A card that does not act should not outrank the one that does.
 * The accent is still spent here and nowhere else on the screen; it is spent
 * on the code and the edge instead of on 232 by 76 points of fill.
 */
export function OffersRail({ offers }: { offers: PromoOffer[] }) {
  const { spacing, radius, colors } = useTheme();

  if (offers.length === 0) return null;

  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeader title="Offers" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
      >
        {offers.map((offer) => (
          <View
            key={offer.code}
            accessible
            accessibilityLabel={`Offer ${offer.code}. ${offer.description}`}
            style={{
              width: 232,
              gap: spacing['2xs'],
              padding: spacing.md,
              borderRadius: radius.lg,
              backgroundColor: colors.accentMuted,
              borderWidth: 1,
              borderColor: colors.accent,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Ionicons name="pricetag" size={16} color={colors.accent} />
              <Text variant="heading" style={{ color: colors.accent, letterSpacing: 1 }}>
                {offer.code}
              </Text>
            </View>
            <Text variant="caption" numberOfLines={2} tone="muted">
              {offer.description}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
