import { EVENT_KIND_SINGULAR, formatMoney, type EventSummary } from '@app/shared';
import { Pressable, View } from 'react-native';
import { Poster, Text } from '../../components/ui';
import { formatTime } from '../../lib/format';
import { useTheme } from '../../theme';

/** Day number and short month, from an ISO string, in the device's own day. */
function dayParts(iso: string): { day: string; month: string } {
  const d = new Date(iso);
  return {
    day: String(d.getDate()),
    month: d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
  };
}

/**
 * One event in a list.
 *
 * Rebuilt around what somebody scanning a list is actually asking, which is
 * *when* and then *what*. The first version led with a red MATCH or WORKSHOP
 * badge on every card — the loudest element on the row, saying the one thing
 * the category chips directly above it had already been used to choose — and
 * buried the date as the third of four identically weighted grey lines.
 *
 * So: a date block on the left, because a date is a number and a number
 * should look like one; the title as the only loud thing; the venue and the
 * price sharing the last line so the card balances rather than trailing off;
 * and the kind demoted to a quiet word beside the price, where it belongs.
 */
export function EventCard({ event, onPress }: { event: EventSummary; onPress: () => void }) {
  const { colors, radius, spacing } = useTheme();

  const when = event.nextShowAt ? dayParts(event.nextShowAt) : null;

  const where = event.venue
    ? event.cityCount > 1
      ? `${event.venue.city} +${event.cityCount - 1} more`
      : `${event.venue.name}, ${event.venue.city}`
    : 'No dates on sale';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        `${event.title}. ${EVENT_KIND_SINGULAR[event.kind]}. ` +
        (event.nextShowAt
          ? `Next on ${when!.day} ${when!.month}, ${formatTime(event.nextShowAt)}. `
          : 'No dates on sale. ') +
        `${where}. ` +
        (event.fromPriceMinor ? `From ${formatMoney(event.fromPriceMinor, 'INR')}.` : '')
      }
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
      })}
    >
      {/* The date, as a date. A tile of three short lines reads at a glance
          in a way "27 Oct · 9:30 am" set in body grey never does. */}
      <View
        style={{
          // Wide enough for "10:00 am", which wrapped to two lines at 52.
          width: 64,
          paddingVertical: spacing.sm,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceMuted,
          alignItems: 'center',
          gap: 1,
        }}
      >
        {when ? (
          <>
            <Text variant="overline" style={{ color: colors.primary }}>
              {when.month}
            </Text>
            <Text variant="title" numeric style={{ lineHeight: 26 }}>
              {when.day}
            </Text>
            <Text variant="caption" tone="muted" numeric>
              {formatTime(event.nextShowAt!)}
            </Text>
          </>
        ) : (
          <Text variant="caption" tone="muted" align="center">
            No{'\n'}dates
          </Text>
        )}
      </View>

      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="label" numberOfLines={2}>
          {event.title}
        </Text>

        <Text variant="caption" tone="muted" numberOfLines={1}>
          {where}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Text variant="caption" tone="muted">
            {EVENT_KIND_SINGULAR[event.kind]}
          </Text>
          {event.fromPriceMinor !== null ? (
            <>
              <Text variant="caption" tone="muted">
                ·
              </Text>
              <Text variant="caption" numeric style={{ color: colors.primary, fontWeight: '700' }}>
                from {formatMoney(event.fromPriceMinor, 'INR')}
              </Text>
            </>
          ) : null}
          {event.minAge ? (
            <>
              <Text variant="caption" tone="muted">
                ·
              </Text>
              <Text variant="caption" tone="muted">
                {event.minAge}+
              </Text>
            </>
          ) : null}
        </View>
      </View>

      {/* Small and square. The artwork here is a team crest, a portrait or a
          painting rather than a poster shot to one ratio, so a tall frame
          crops half of them badly; a square is the shape they all survive. */}
      <Poster
        uri={event.posterUrl}
        title={event.title}
        rounded={radius.md}
        style={{ width: 56, height: 56 }}
      />
    </Pressable>
  );
}
