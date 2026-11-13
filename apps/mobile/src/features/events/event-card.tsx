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
 * So: the date first and in the accent, the title as the only loud thing,
 * the venue under it, and the kind demoted to a quiet word beside the price,
 * where it belongs.
 *
 * The date had its own tile for a while, on the grounds that a date is a
 * number and a number should look like one. That tile cost 64 points on
 * every row, and it was being paid for by the artwork - 56 points square,
 * last in the row, in an app whose film pages hand a poster the whole
 * screen. The accent does the same job in a line.
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
      {/* The artwork, at a size somebody can recognise.
      
          It was 56 points square, on the right, with a 64-point date tile on
          the left and the text squeezed between them. A crest, a face, a
          painting - the one thing that tells you instantly what an event is -
          shown at the size of a stamp, in an app whose film pages give the
          artwork the whole screen.
      
          Moving the date into the column pays for it twice: the picture goes
          from 56 to 96 and the text column gets *wider* than it was, so the
          titles that wrapped to two lines have more room rather than less.
      
          Square, not a tall frame: this art is a team crest, a portrait or a
          painting rather than a poster shot to one ratio, and a square is the
          shape they all survive. */}
      <Poster
        uri={event.posterUrl}
        title={event.title}
        rounded={radius.md}
        style={{ width: 96, height: 96 }}
      />

      <View style={{ flex: 1, gap: 3 }}>
        {/* The date keeps its own weight by taking the accent rather than a
            tile. It was moved out of the body text once already because it
            was "the third of four identically weighted grey lines"; it is not
            grey here. */}
        <Text variant="overline" style={{ color: colors.accent }} numberOfLines={1}>
          {when
            ? `${when.month} ${when.day} · ${formatTime(event.nextShowAt!)}`
            : 'NO DATES ON SALE'}
        </Text>

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
    </Pressable>
  );
}
