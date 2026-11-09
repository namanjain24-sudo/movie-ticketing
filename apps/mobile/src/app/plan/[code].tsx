import { formatMoney } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, Share, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { plansApi } from '../../api/plans';
import { ErrorState, LoadingState } from '../../components/query-state';
import { AppBar, Button, Poster, Screen, Text } from '../../components/ui';
import { useAuth } from '../../features/auth/auth-provider';
import { formatRelativeDay, formatTime } from '../../lib/format';
import { tapFeedback } from '../../lib/haptics';
import { queryKeys } from '../../lib/query-client';
import { shareLink } from '../../lib/share-link';
import { useTheme } from '../../theme';
import { HIT_SIZE, NUMERIC } from '../../theme/tokens';

/**
 * One watch party: a shortlist of showings and who can make each.
 *
 * Reading it needs no account, because the code arrives in a group chat and
 * the first thing it should do is show what is being proposed. Marking a
 * showing does need one, and the screen says so where the control would be
 * rather than at the door.
 */
export default function PlanScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();

  const plan = useQuery({
    queryKey: queryKeys.plan(code ?? ''),
    queryFn: () => plansApi.get(code ?? ''),
    enabled: Boolean(code),
  });

  // Both mutations answer with the whole plan, so the tally, the membership
  // and your own marks all move together. Writing the response straight into
  // the cache keeps them from arriving a frame apart.
  const settle = (next: Awaited<ReturnType<typeof plansApi.get>>) => {
    queryClient.setQueryData(queryKeys.plan(code ?? ''), next);
    void queryClient.invalidateQueries({ queryKey: queryKeys.plans });
  };

  const join = useMutation({
    mutationFn: () => plansApi.join(code ?? ''),
    onSuccess: settle,
  });

  const mark = useMutation({
    mutationFn: (optionId: string) => plansApi.toggleVote(code ?? '', optionId),
    onSuccess: settle,
  });

  if (plan.isPending) return <LoadingState />;
  if (plan.isError || !plan.data) {
    return (
      <ErrorState
        title="That plan is not here"
        error={plan.error}
        onRetry={() => void plan.refetch()}
      />
    );
  }

  const data = plan.data;
  const best = Math.max(0, ...data.options.map((option) => option.votes));

  return (
    <Screen scroll>
      <AppBar
        title={data.movie.title}
        subtitle={`Watch party in ${data.city}`}
        onBack={() => router.back()}
        titleLines={2}
      />

      <View style={{ gap: spacing.xl, paddingTop: spacing.lg }}>
        <Animated.View
          entering={FadeInDown.duration(280)}
          style={{ flexDirection: 'row', gap: spacing.lg }}
        >
          <Poster
            uri={data.movie.posterUrl}
            title={data.movie.title}
            rounded={radius.lg}
            style={{ width: 92, height: 134 }}
          />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text variant="overline" tone="muted">
              {data.settled ? 'OVER' : `${data.memberCount} IN`}
            </Text>
            <Text variant="title" numberOfLines={2}>
              {data.youAreOrganiser ? 'Your plan' : `${data.organiserName}'s plan`}
            </Text>
            <Text variant="caption" tone="muted">
              {data.settled
                ? 'The last showing on this shortlist has started.'
                : 'Mark every showing you could make. The one most people can is the one to book.'}
            </Text>
          </View>
        </Animated.View>

        {!data.settled ? (
          <View style={{ gap: spacing.sm }}>
            <Button
              label="Share this plan"
              variant="secondary"
              onPress={() => {
                void Share.share({
                  message:
                    `${data.organiserName} wants to watch ${data.movie.title} in ${data.city}.\n` +
                    `Code ${data.code}\n${shareLink(`/plan/${data.code}`)}`,
                });
              }}
            />
            {isSignedIn && !data.youJoined ? (
              <Button
                label="Join this plan"
                loading={join.isPending}
                onPress={() => {
                  tapFeedback();
                  join.mutate();
                }}
              />
            ) : null}
            {!isSignedIn ? (
              <Button
                label="Sign in to join"
                variant="secondary"
                onPress={() => router.push('/sign-in')}
              />
            ) : null}
          </View>
        ) : null}

        <View style={{ gap: spacing.md }}>
          {data.options.map((option, index) => {
            const leading = option.votes > 0 && option.votes === best;
            const canMark = isSignedIn && data.youJoined && !data.settled;

            return (
              <Animated.View key={option.id} entering={FadeInDown.delay(40 * index).duration(260)}>
                <Pressable
                  onPress={() => {
                    if (!canMark || mark.isPending) return;
                    tapFeedback();
                    mark.mutate(option.id);
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: option.youVoted, disabled: !canMark }}
                  accessibilityLabel={`${formatRelativeDay(option.startsAt)} ${formatTime(
                    option.startsAt,
                  )} at ${option.cinemaName}, ${option.votes} ${
                    option.votes === 1 ? 'person' : 'people'
                  } can make it`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.md,
                    padding: spacing.lg,
                    minHeight: HIT_SIZE,
                    borderRadius: radius.lg,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    // The leading showing is outlined in the accent, which is
                    // the one thing on this screen that is live: it moves as
                    // people answer.
                    borderColor: leading ? colors.accent : colors.border,
                  }}
                >
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: radius.full,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: option.youVoted ? colors.primarySolid : 'transparent',
                      borderWidth: option.youVoted ? 0 : 1,
                      borderColor: colors.borderStrong,
                    }}
                  >
                    {option.youVoted ? (
                      <Ionicons name="checkmark" size={16} color={colors.onPrimary} />
                    ) : null}
                  </View>

                  <View style={{ flex: 1, gap: spacing['2xs'] }}>
                    <Text variant="label" numeric>
                      {formatRelativeDay(option.startsAt)}, {formatTime(option.startsAt)}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {option.cinemaName}
                    </Text>
                    <Text variant="caption" tone="muted" numeric>
                      {formatMoney(option.fromPriceMinor, option.currency)} onwards
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end', gap: spacing['2xs'] }}>
                    <Text
                      variant="heading"
                      numeric
                      style={{ color: leading ? colors.accent : colors.text }}
                    >
                      {option.votes}
                    </Text>
                    <Text variant="caption" tone="muted" style={NUMERIC}>
                      of {data.memberCount}
                    </Text>
                  </View>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>

        {isSignedIn && !data.youJoined && !data.settled ? (
          <Text variant="caption" tone="muted" align="center">
            Join the plan to mark the showings you can make.
          </Text>
        ) : null}

        {data.youJoined && !data.settled ? (
          <Button
            label="Book the one you agreed on"
            variant="secondary"
            onPress={() => router.push(`/movie/${data.movie.slug}`)}
          />
        ) : null}
      </View>
    </Screen>
  );
}
