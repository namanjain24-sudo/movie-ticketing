import { formatMoney, type ActiveHold } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { bookingApi } from '../../api/booking';
import { Text } from '../../components/ui';
import { tapFeedback } from '../../lib/haptics';
import { AnimatedPressable, usePressScale } from '../../lib/use-press-scale';
import { queryKeys } from '../../lib/query-client';
import { useTheme } from '../../theme';
import { NUMERIC } from '../../theme/tokens';
import { useAuth } from '../auth/auth-provider';
import { subjectTitle } from '../catalog/subject';
import { useCountdown } from './use-countdown';

/**
 * The way back to seats you are already holding.
 *
 * A hold is the one thing in this app that loses value while nobody is
 * looking at it: it expires after five minutes whatever the phone is doing,
 * and then the seats go back on sale. Leaving checkout is not unusual — a
 * call comes in, somebody switches away to check a date or a bank balance,
 * the phone sleeps — and until now there was no route back to it. The app
 * forgot, the five minutes ran out, and the seats were lost for nothing.
 *
 * `/holds/active` was written for exactly this and had no caller. It already
 * decides expiry against the database clock, so it cannot offer to resume
 * something that is gone, and it leaves out any hold that has become a
 * booking — which is what stops this appearing over somebody's shoulder in
 * the seconds after they have paid.
 *
 * Only on the tabs. The seat map and checkout are the two screens this would
 * be talking over, and on both of them the person can already see the thing
 * it would be telling them about.
 */
export function HeldSeatsBanner() {
  const { isSignedIn } = useAuth();

  const holds = useQuery({
    queryKey: queryKeys.activeHolds,
    queryFn: bookingApi.activeHolds,
    enabled: isSignedIn,
    // Coming back to the app is the moment this matters most, and it is also
    // the moment the answer is most likely to have changed.
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  // Newest first, which is what the server's `expiresAt: desc` amounts to:
  // the one with the most time left is the one just walked away from.
  const held = holds.data?.[0];
  if (!held) return null;

  return <Banner held={held} />;
}

/**
 * Split out so the countdown's twice-a-second tick re-renders this strip and
 * nothing else. Left in the component above, every tab screen under the
 * layout would re-render along with it.
 */
function Banner({ held }: { held: ActiveHold }) {
  const { colors, radius, spacing } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const press = usePressScale();
  const { label, hasExpired, isUrgent } = useCountdown(held.hold.expiresAt, held.hold.serverTime);

  useEffect(() => {
    // Gone. Drop it from the cache rather than merely hiding it, so nothing
    // else in the app is still working from a hold that no longer exists.
    if (hasExpired) void queryClient.invalidateQueries({ queryKey: queryKeys.activeHolds });
  }, [hasExpired, queryClient]);

  if (hasExpired) return null;

  const title = subjectTitle(held.showtime);
  const seats = held.hold.seats.map((s) => `${s.rowLabel}${s.number}`).join(', ');
  const accent = isUrgent ? colors.warning : colors.primary;

  return (
    <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(140)}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={`${held.hold.seats.length} seats held for ${title}, ${label} left. Finish paying.`}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={() => {
          tapFeedback();
          router.push(`/checkout/${held.hold.id}`);
        }}
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            marginHorizontal: spacing.lg,
            marginBottom: spacing.sm,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: accent,
            backgroundColor: colors.surface,
          },
          press.style,
        ]}
      >
        <Ionicons name="timer-outline" size={18} color={accent} />
        <View style={{ flex: 1, gap: 1 }}>
          <Text variant="label" numberOfLines={1}>
            {held.hold.seats.length} {held.hold.seats.length === 1 ? 'seat' : 'seats'} held · {title}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1} style={NUMERIC}>
            {seats} · {formatMoney(held.hold.totalMinor, held.hold.currency)}
          </Text>
        </View>
        <Text variant="label" numeric style={{ color: accent }}>
          {label}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </AnimatedPressable>
    </Animated.View>
  );
}
