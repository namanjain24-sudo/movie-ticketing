import type { SeatMap, SeatTier } from '@app/shared';
import { formatMoney } from '@app/shared';
import { View } from 'react-native';
import { Text } from '../../components/ui';
import { AnimatedPressable, usePressScale } from '../../lib/use-press-scale';
import { useTheme } from '../../theme';
import { NUMERIC } from '../../theme/tokens';
import type { SeatRenderStatus } from './use-seat-selection';

/**
 * What each stand costs and how much of it is left — the question somebody
 * buying a match ticket asks before they care about a row number.
 *
 * The seat map already carried every fact this needs; it just made you scroll
 * the whole bowl to assemble them. A stand's price was a section heading five
 * hundred points down, and whether it still had seats was something you found
 * out by looking at the colour of two hundred squares.
 *
 * Counted from the seats rather than asked of the server, because the seats
 * are already here and a second number from a second source is a number that
 * can disagree with the map under it.
 */

type Tier = SeatMap['tiers'][number];

/** Fewer than this left in a stand and it is worth saying so. */
const FILLING_FAST = 0.15;

export interface StandSummary {
  tier: SeatTier;
  label: string;
  priceMinor: number;
  free: number;
  total: number;
}

export function summariseStands(
  tiers: Tier[],
  seats: SeatMap['seats'],
  statusOf: (seat: SeatMap['seats'][number]) => SeatRenderStatus,
): StandSummary[] {
  const counts = new Map<SeatTier, { free: number; total: number }>();
  for (const seat of seats) {
    const entry = counts.get(seat.tier) ?? { free: 0, total: 0 };
    entry.total += 1;
    // HELD_BY_YOU is still yours to take, so it counts as available to you —
    // the same rule the seat map itself paints by.
    const status = statusOf(seat);
    if (status === 'AVAILABLE' || status === 'HELD_BY_YOU') entry.free += 1;
    counts.set(seat.tier, entry);
  }

  return tiers.map((t) => ({
    tier: t.tier,
    label: t.label,
    priceMinor: t.priceMinor,
    free: counts.get(t.tier)?.free ?? 0,
    total: counts.get(t.tier)?.total ?? 0,
  }));
}

export function StandPicker({
  stands,
  currency,
  activeTier,
  onSelect,
}: {
  stands: StandSummary[];
  currency: string;
  activeTier?: SeatTier;
  onSelect: (tier: SeatTier) => void;
}) {
  const { colors, radius, spacing } = useTheme();

  if (stands.length === 0) return null;

  return (
    <View style={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}>
      {stands.map((stand) => (
        <StandRow
          key={stand.tier}
          stand={stand}
          currency={currency}
          active={stand.tier === activeTier}
          colors={colors}
          radius={radius}
          spacing={spacing}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}

function StandRow({
  stand,
  currency,
  active,
  colors,
  radius,
  spacing,
  onSelect,
}: {
  stand: StandSummary;
  currency: string;
  active: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  radius: ReturnType<typeof useTheme>['radius'];
  spacing: ReturnType<typeof useTheme>['spacing'];
  onSelect: (tier: SeatTier) => void;
}) {
  const press = usePressScale();
  const soldOut = stand.free === 0;
  const share = stand.total > 0 ? stand.free / stand.total : 0;
  const filling = !soldOut && share <= FILLING_FAST;

  // A sold-out stand stays on the list rather than disappearing: a bowl that
  // quietly drops its cheap end looks like a bowl that never had one, and the
  // price somebody is being asked to pay instead is the whole story.
  const note = soldOut ? 'Sold out' : filling ? 'Filling fast' : 'Available';
  const tone = soldOut ? colors.textMuted : filling ? colors.warning : colors.success;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={soldOut}
      accessibilityState={{ disabled: soldOut }}
      accessibilityLabel={`${stand.label}, ${formatMoney(stand.priceMinor, currency)}, ${note}${
        soldOut ? '' : `, ${stand.free} of ${stand.total} seats left`
      }`}
      onPressIn={soldOut ? undefined : press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={soldOut ? undefined : () => onSelect(stand.tier)}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: active ? colors.primary : colors.border,
          backgroundColor: colors.surface,
          opacity: soldOut ? 0.55 : 1,
        },
        press.style,
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label" numberOfLines={1}>
          {stand.label}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone }} />
          <Text variant="caption" style={{ color: tone }}>
            {note}
          </Text>
          {soldOut ? null : (
            <Text variant="caption" tone="muted" style={NUMERIC}>
              · {stand.free} left
            </Text>
          )}
        </View>
      </View>
      <Text variant="heading" numeric>
        {formatMoney(stand.priceMinor, currency)}
      </Text>
    </AnimatedPressable>
  );
}
