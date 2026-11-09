import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Text } from '../../components/ui';
import { useTheme } from '../../theme';
import { NUMERIC } from '../../theme/tokens';
import type { Streak } from './streak';

/**
 * A run of months with a booking in them.
 *
 * Like `TierCard` next to it, **it promises nothing**, because nothing is
 * implemented to deliver. A streak counter is the single most tempting place
 * in a product to write "keep it up for a free ticket", and the booking code
 * would refuse that the moment anybody tried to claim it. So this says only
 * what it is: a record of a habit, derived from the user's own bookings.
 *
 * The accent is spent here on purpose and once. Lime means something is
 * alive, which is exactly what a running streak is, and the number is the one
 * thing on this screen that is true only today. A streak that has lapsed is
 * not alive and does not get it.
 */
export function StreakCard({ streak }: { streak: Streak }) {
  const { colors, radius, spacing } = useTheme();

  // Nobody with no bookings needs a counter telling them so. The empty
  // profile already has a sign-in prompt and an empty Bookings tab; a third
  // zero adds discouragement and no information.
  if (streak.longest === 0) return null;

  const running = streak.current > 0;
  const tone = !running ? colors.textMuted : streak.atRisk ? colors.warning : colors.accent;

  const headline = running
    ? `${streak.current} ${streak.current === 1 ? 'month' : 'months'} in a row`
    : 'Streak ended';

  // Three states, three different true things to say. None of them is an
  // instruction: the app does not know why somebody stopped going.
  const note = !running
    ? `Your longest run was ${streak.longest} ${streak.longest === 1 ? 'month' : 'months'}.`
    : streak.atRisk
      ? 'Nothing booked this month yet.'
      : streak.current >= streak.longest
        ? 'Your longest run so far.'
        : `Your best is ${streak.longest}.`;

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      accessibilityRole="summary"
      accessibilityLabel={`${headline}. ${note}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: spacing.lg,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: running && !streak.atRisk ? colors.accentMuted : colors.surfaceMuted,
        }}
      >
        <Ionicons name={running ? 'flame' : 'flame-outline'} size={22} color={tone} />
      </View>

      <View style={{ flex: 1, gap: spacing['2xs'] }}>
        <Text variant="heading" numeric style={{ color: tone }}>
          {headline}
        </Text>
        <Text variant="caption" tone="muted" style={NUMERIC}>
          {note}
        </Text>
      </View>
    </Animated.View>
  );
}
