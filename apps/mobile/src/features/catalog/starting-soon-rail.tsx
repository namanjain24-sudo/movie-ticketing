import { formatMoney } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Badge, Poster, Text } from '../../components/ui';
import { formatMinutesUntil, formatTime } from '../../lib/format';
import { formatDistance } from '../../lib/maps';
import { usePressScale } from '../../lib/use-press-scale';
import { useTheme } from '../../theme';
import { SectionHeader } from './section-header';
import type { SoonShow } from './starting-soon';

/**
 * Close enough to the start that the clock is the reason to tap, rather than
 * one more fact about the row.
 *
 * Forty-five minutes is where "this evening" turns into "now". Above it the
 * time is information and reads as information; below it the row is the only
 * one on the screen with a deadline, and it says so in the colour the rest of
 * the app already uses for a show filling up.
 */
const URGENT_WITHIN_MINUTES = 45;

/**
 * What you can still get to, as the one rail on the home screen with a
 * deadline on it.
 *
 * Deliberately not using the accent. `OffersRail` spends it just above here
 * and says in its own comment that it is spent there and nowhere else on the
 * page, which is the rule that keeps the lime meaning something. This rail
 * borrows `warning` instead, which already means "hurry" everywhere else in
 * the product, and so arrives already understood.
 *
 * Nothing here is a discount. There is no per-showtime price reduction in the
 * catalogue, so there is no saving to claim and the card claims none: the
 * price is the real `fromPriceMinor`, the distance is the server's own
 * `distanceKm`, and the countdown is the clock. A rail like this is where a
 * made-up "40% off" flash would go, and it would be a lie rendered in the
 * house style.
 */
export function StartingSoonRail({
  shows,
  onSelect,
}: {
  shows: SoonShow[];
  onSelect: (show: SoonShow) => void;
}) {
  const { spacing } = useTheme();

  if (shows.length === 0) return null;

  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeader title="Still catchable" note="Starting soon, close enough to make it" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
      >
        {shows.map((show) => (
          <SoonCard key={show.id} show={show} onPress={() => onSelect(show)} />
        ))}
      </ScrollView>
    </View>
  );
}

function SoonCard({ show, onPress }: { show: SoonShow; onPress: () => void }) {
  const { colors, radius, spacing, elevation } = useTheme();
  const press = usePressScale();

  const { showtime, cinema, minutesUntil } = show;
  const subject = showtime.movie ?? showtime.event;
  const urgent = minutesUntil <= URGENT_WITHIN_MINUTES;
  const distance = formatDistance(cinema.distanceKm);

  const countdown = formatMinutesUntil(minutesUntil);

  return (
    <Animated.View style={press.style}>
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={`${subject?.title ?? 'Show'} at ${cinema.name}, starts ${formatTime(
          showtime.startsAt,
        )}, ${countdown}${distance ? `, ${distance} away` : ''}, from ${formatMoney(
          showtime.fromPriceMinor,
          showtime.currency,
        )}`}
        style={{
          width: 268,
          flexDirection: 'row',
          gap: spacing.md,
          padding: spacing.md,
          borderRadius: radius.xl,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: urgent ? colors.warning : colors.border,
          ...elevation.card,
        }}
      >
        <Poster
          uri={subject?.posterUrl}
          title={subject?.title ?? ''}
          rounded={radius.md}
          sheen={false}
          style={{ width: 62, height: 90 }}
        />

        <View style={{ flex: 1, justifyContent: 'space-between' }}>
          <View style={{ gap: spacing['2xs'] }}>
            <Text variant="label" numberOfLines={2}>
              {subject?.title ?? 'Show'}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {cinema.name}
            </Text>
          </View>

          <View style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Ionicons
                name="time-outline"
                size={13}
                color={urgent ? colors.warning : colors.textMuted}
              />
              <Text
                variant="caption"
                numeric
                style={{ color: urgent ? colors.warning : colors.textMuted }}
              >
                {formatTime(showtime.startsAt)} · {countdown}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text variant="caption" numeric>
                {formatMoney(showtime.fromPriceMinor, showtime.currency)}
              </Text>
              {distance ? (
                <Text variant="caption" tone="muted" numeric>
                  {distance}
                </Text>
              ) : null}
              {showtime.availability === 'ALMOST_FULL' ? (
                <Badge label="Almost full" tone="warning" />
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
