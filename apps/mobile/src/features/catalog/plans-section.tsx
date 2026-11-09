import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { plansApi } from '../../api/plans';
import { Text } from '../../components/ui';
import { formatRelativeDay, formatTime } from '../../lib/format';
import { queryKeys } from '../../lib/query-client';
import { useTheme } from '../../theme';
import { HIT_SIZE } from '../../theme/tokens';

/**
 * The watch parties this account is in.
 *
 * Without this an organiser could lose their own plan: the only ways back to
 * one were the code they sent somebody else and the link in a chat they might
 * not have sent to themselves.
 *
 * The leading showing is named rather than the tally drawn, because at a
 * glance what somebody wants is "is this decided yet", and the plan screen is
 * one tap away for the rest.
 */
export function PlansSection() {
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();
  const plans = useQuery({ queryKey: queryKeys.plans, queryFn: plansApi.mine });

  const mine = plans.data ?? [];
  if (mine.length === 0) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="overline" tone="muted">
        WATCH PARTIES
      </Text>

      {mine.map((plan) => {
        const best = Math.max(0, ...plan.options.map((option) => option.votes));
        // Only once somebody has actually marked something. A "leading"
        // showing at nil votes is just the earliest one, dressed up.
        const leader = best > 0 ? plan.options.find((option) => option.votes === best) : undefined;

        return (
          <Pressable
            key={plan.code}
            onPress={() => router.push(`/plan/${plan.code}`)}
            accessibilityRole="button"
            accessibilityLabel={`Watch party for ${plan.movie.title}, ${plan.memberCount} ${
              plan.memberCount === 1 ? 'person' : 'people'
            } in`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              minHeight: HIT_SIZE,
              padding: spacing.lg,
              borderRadius: radius.lg,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Ionicons name="people" size={18} color={colors.primary} />
            <View style={{ flex: 1, gap: spacing['2xs'] }}>
              <Text variant="label" numberOfLines={1}>
                {plan.movie.title}
              </Text>
              <Text variant="caption" tone="muted" numeric numberOfLines={1}>
                {leader
                  ? `${formatRelativeDay(leader.startsAt)}, ${formatTime(leader.startsAt)} leading`
                  : 'Nobody has marked a showing yet'}
              </Text>
            </View>
            <Text variant="caption" tone="muted" numeric>
              {plan.memberCount} in
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
