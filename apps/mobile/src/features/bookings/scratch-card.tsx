import type { ScratchCard as Card } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { rewardsApi } from '../../api/rewards';
import { Text } from '../../components/ui';
import { successFeedback, tapFeedback } from '../../lib/haptics';
import { queryKeys } from '../../lib/query-client';
import { useTheme } from '../../theme';
import { motion } from '../../theme/tokens';

/**
 * A reward that came with a booking.
 *
 * The prize is not in this component until the server sends it. The list
 * endpoint returns `points: null` for anything unopened, so there is nothing
 * here to leak, read out of a response, or reveal early by tampering with the
 * animation. The tap is a request, and what it answers with is the prize.
 *
 * Which is why the copy says "open" rather than "scratch and win". Nothing is
 * being decided by the gesture, and a card that implied it was would be
 * lying about where the number came from.
 */
export function RewardsSection() {
  const { spacing } = useTheme();
  const cards = useQuery({ queryKey: queryKeys.rewards, queryFn: rewardsApi.cards });

  // Newest first, and sorted here rather than trusted from the response: the
  // endpoint does not promise an order, and the heading below says "your last
  // booking", which is only true of whichever card is actually first.
  const unopened = (cards.data ?? [])
    .filter((card) => card.scratchedAt === null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Opened cards are history, and the profile already has somewhere for
  // history. Only the ones with something left in them earn space here.
  if (unopened.length === 0) return null;

  return (
    <View style={{ gap: spacing.md }}>
      {unopened.map((card, index) => (
        <RewardCard key={card.id} card={card} latest={index === 0} />
      ))}
    </View>
  );
}

function RewardCard({ card, latest }: { card: Card; latest: boolean }) {
  const { colors, radius, spacing, gradients, elevation } = useTheme();
  const queryClient = useQueryClient();
  const scale = useSharedValue(1);

  const open = useMutation({
    mutationFn: () => rewardsApi.scratch(card.id),
    onSuccess: async (result) => {
      successFeedback();
      // The balance on this same screen has just changed, and the reward list
      // now holds an opened card. Both are stale the moment this returns.
      queryClient.setQueryData(queryKeys.rewards, (previous: Card[] | undefined) =>
        (previous ?? []).map((item) => (item.id === result.card.id ? result.card : item)),
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.loyaltyBalance });
    },
  });

  const won = open.data?.card.points ?? null;

  // A short punch outwards and back once the prize is known. Written in an
  // effect rather than in the mutation's callback: React Compiler treats a
  // shared-value write inside another hook's options as a write during
  // render, and an effect keyed on the revealed value is how the rest of this
  // app animates a state change.
  useEffect(() => {
    if (won === null) return;
    scale.value = withSequence(
      withSpring(1.04, motion.spring.settle),
      withSpring(1, motion.spring.settle),
    );
  }, [won, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View entering={FadeIn.duration(220)} style={style}>
      <Pressable
        onPress={() => {
          if (open.isPending || won !== null) return;
          tapFeedback();
          open.mutate();
        }}
        accessibilityRole="button"
        accessibilityState={{ disabled: open.isPending || won !== null }}
        accessibilityLabel={
          won !== null
            ? `You won ${won} points on booking ${card.bookingReference}`
            : `Open the reward from booking ${card.bookingReference}`
        }
        style={{ borderRadius: radius['2xl'], overflow: 'hidden', ...elevation.card }}
      >
        <LinearGradient
          colors={won !== null ? [...gradients.accent] : [...gradients.reward]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            padding: spacing.lg,
            gap: spacing.xs,
            minHeight: 120,
            justifyContent: 'center',
          }}
        >
          {won !== null ? (
            <Animated.View entering={FadeIn.duration(260)} style={{ gap: spacing['2xs'] }}>
              {/* On the lime gradient the readable ink is the dark one, which
                  is what `textInverse` is in the light theme and what
                  `onImageSurface` is in both. The latter, because this fill
                  does not flip with the theme. */}
              <Text variant="display" numeric style={{ color: colors.onImageSurface }}>
                +{won}
              </Text>
              <Text variant="label" style={{ color: colors.onImageSurface }}>
                {won === 1 ? 'point added' : 'points added'}
              </Text>
              <Text variant="caption" style={{ color: colors.onImageSurface, opacity: 0.8 }}>
                Spend them at checkout, a rupee each.
              </Text>
            </Animated.View>
          ) : (
            <View style={{ gap: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name="gift" size={22} color={colors.onImage} />
                <Text variant="heading" style={{ color: colors.onImage }}>
                  {/* Two unopened cards both headed "your last booking" is one
                      of them lying, and it reads as a duplicate rather than as
                      two rewards. Only the newest gets that line. */}
                  {open.isPending
                    ? 'Opening…'
                    : latest
                      ? 'A reward from your last booking'
                      : 'A reward from an earlier booking'}
                </Text>
              </View>
              <Text variant="caption" style={{ color: colors.onImageMuted }} numeric>
                {open.isError
                  ? 'That did not open. Tap to try again.'
                  : `Tap to open · ${card.bookingReference}`}
              </Text>
            </View>
          )}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}
