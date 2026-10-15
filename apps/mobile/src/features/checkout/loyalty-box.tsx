import { formatMoney, type LoyaltyQuote } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';
import { Button, Card, Text } from '../../components/ui';
import { useTheme } from '../../theme';

/**
 * Where a points redemption is offered, applied, and shown to be working.
 * Mirrors PromoBox's three states — empty, applied, locked — but there is
 * nothing to type: the whole offer is one tap away, since asking someone to
 * dial in a number of points to spend is a stepper nobody asked for.
 */
export function LoyaltyBox({
  pointsToOffer,
  applied,
  busy,
  error,
  locked,
  onApply,
  onRemove,
}: {
  /**
   * How many points a single tap would redeem — already capped by both the
   * user's balance and what these seats can use (see `checkout/[holdId].tsx`).
   * Zero means there is nothing to offer, so the box renders nothing.
   */
  pointsToOffer: number;
  applied: LoyaltyQuote | null;
  busy: boolean;
  error: string | null;
  locked: boolean;
  onApply: () => void;
  onRemove: () => void;
}) {
  const { colors, spacing } = useTheme();

  if (applied) {
    return (
      <Card style={{ borderColor: colors.success }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Ionicons name="sparkles" size={20} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text variant="label">
              {applied.points} point{applied.points === 1 ? '' : 's'} applied
            </Text>
            <Text variant="caption" tone="muted">
              You save {formatMoney(applied.discountMinor, applied.currency)}
            </Text>
          </View>
          {locked ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove points"
              hitSlop={8}
              onPress={onRemove}
            >
              <Text variant="label" tone="primary">
                Remove
              </Text>
            </Pressable>
          )}
        </View>
      </Card>
    );
  }

  if (locked || pointsToOffer <= 0) return null;

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Ionicons name="sparkles-outline" size={20} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text variant="label">Use your points</Text>
          <Text variant="caption" tone="muted">
            {pointsToOffer} point{pointsToOffer === 1 ? '' : 's'} ={' '}
            {formatMoney(pointsToOffer * 100, 'INR')} off
          </Text>
        </View>
        <Button label="Use" variant="secondary" size="sm" loading={busy} onPress={onApply} />
      </View>
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </Card>
  );
}
