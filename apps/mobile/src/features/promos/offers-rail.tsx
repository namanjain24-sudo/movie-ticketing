import type { PromoOffer } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, View } from 'react-native';
import { Text } from '../../components/ui';
import { gradients } from '../../theme/tokens';
import { useTheme } from '../../theme';
import { SectionHeader } from '../catalog/section-header';

/**
 * What the user can save right now, above the film grid. Informational: a code
 * is applied at checkout, where there is a price for it to change, so the cards
 * say where to use it rather than pretending to be buttons that do nothing.
 */
export function OffersRail({ offers }: { offers: PromoOffer[] }) {
  const { spacing, radius } = useTheme();

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
          <LinearGradient
            key={offer.code}
            colors={gradients.accent}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            accessible
            accessibilityLabel={`Offer ${offer.code}. ${offer.description}`}
            style={{
              width: 232,
              gap: 2,
              padding: spacing.md,
              borderRadius: radius.lg,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Ionicons name="pricetag" size={16} color="#FFFFFF" />
              <Text variant="heading" style={{ color: '#FFFFFF', letterSpacing: 1 }}>
                {offer.code}
              </Text>
            </View>
            <Text variant="caption" numberOfLines={2} style={{ color: 'rgba(255,255,255,0.86)' }}>
              {offer.description}
            </Text>
          </LinearGradient>
        ))}
      </ScrollView>
    </View>
  );
}
