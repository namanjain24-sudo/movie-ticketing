import { LOYALTY_TIERS, nextTierAfter, tierFor } from '@app/shared';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Text } from '../../components/ui';
import { useTheme } from '../../theme';
import { NUMERIC } from '../../theme/tokens';

/**
 * Where this account stands, ranked on lifetime points.
 *
 * **It promises nothing, because nothing is implemented to deliver.** Every
 * loyalty screen is tempted into "free popcorn at Gold", and writing that
 * here would be the same lie the support agent exists to never tell: the
 * booking code would refuse it the moment anybody tried. So the card says
 * what it actually is — a record of what you have spent — and the copy says
 * so out loud rather than leaving a reader to infer a perk that is not there.
 *
 * The obvious perk, a better earn rate higher up, is deliberately not taken:
 * `earnedPoints` is pure in the booking total so `clawbackEarned` can exactly
 * undo an award, and a rate that moved with a tier the user might have left
 * by the time they cancel would break that on the money path.
 */
export function TierCard({ lifetimePoints }: { lifetimePoints?: number }) {
  const { colors, radius, spacing } = useTheme();

  // Undefined while the balance is still in flight. A tier is a claim about
  // the account, and guessing REGULAR for somebody who is Platinum is a worse
  // answer than not answering yet.
  if (lifetimePoints === undefined) return null;

  const tier = tierFor(lifetimePoints);
  const next = nextTierAfter(lifetimePoints);

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      accessibilityRole="summary"
      accessibilityLabel={
        next
          ? `${tier.name} tier. ${lifetimePoints} points earned in total, ${
              next.minLifetimePoints - lifetimePoints
            } more to reach ${next.name}.`
          : `${tier.name} tier, the highest. ${lifetimePoints} points earned in total.`
      }
      style={{
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
        <Text variant="title">{tier.name}</Text>
        <Text variant="caption" tone="muted" style={NUMERIC}>
          {lifetimePoints} {lifetimePoints === 1 ? 'point' : 'points'} earned, all time
        </Text>
      </View>

      {/* The ladder, as a row of segments rather than one bar: the tiers are
          discrete, and a single bar invites the reading that a tier arrives
          gradually. */}
      <View style={{ flexDirection: 'row', gap: spacing['2xs'] }}>
        {LOYALTY_TIERS.map((step) => {
          const reached = lifetimePoints >= step.minLifetimePoints;
          const current = step.id === tier.id;
          return (
            <View
              key={step.id}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                backgroundColor: reached ? colors.primary : colors.surfaceMuted,
                opacity: reached && !current ? 0.5 : 1,
              }}
            />
          );
        })}
      </View>

      {next ? (
        <Text variant="caption" tone="muted">
          <Text variant="caption" style={{ color: colors.text, ...NUMERIC }}>
            {next.minLifetimePoints - lifetimePoints}
          </Text>{' '}
          more to {next.name}. A tier is a record of what you have booked — it does not change
          prices or unlock anything.
        </Text>
      ) : (
        <Text variant="caption" tone="muted">
          The top tier. It is a record of what you have booked — it does not change prices or
          unlock anything.
        </Text>
      )}
    </Animated.View>
  );
}
