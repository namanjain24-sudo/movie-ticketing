import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Button, Text } from '../../components/ui';
import { formatMinutesUntil, formatMonthDay, formatTime } from '../../lib/format';
import { useTickAt } from '../../lib/use-tick-at';
import { useTheme } from '../../theme';
import { nextSavedTicketChangeAfter, orderSavedTickets, type SavedTicket } from './ticket-vault';

/**
 * The tickets this phone kept, shown when the bookings list cannot be loaded.
 *
 * Without this the offline ticket was reachable only by typing its own URL.
 * The single route to a ticket is this list, the list needs the network, and
 * so the copy existed, was correct, and could not be opened by anyone who did
 * not already know their booking reference — in exactly the situation it was
 * saved for.
 *
 * It is explicitly a fallback and says so. It cannot know about a booking made
 * on another device, or one cancelled since, so it does not claim to be the
 * whole list; `onRetry` is kept prominent because the real list is better
 * whenever it can be had.
 *
 * The vault holds twelve and hands them over in the order they were written,
 * which is the order to evict in and not the order to read in. Ten of those
 * can be films already watched, and opening an old one writes it again and
 * moves it to the front — so the list could put last month's receipt above
 * the show whose queue its owner was standing in. `orderSavedTickets` decides
 * what is still usable; this only has to show it that way.
 */
export function SavedTicketsList({
  tickets,
  onRetry,
  retrying,
}: {
  tickets: SavedTicket[];
  onRetry: () => void;
  retrying: boolean;
}) {
  const { colors, radius, spacing } = useTheme();

  // One wake, when the earliest show falls out of the grace window. A vault of
  // finished tickets answers null and holds no timer at all.
  const nextChange = useCallback(
    (at: number) => nextSavedTicketChangeAfter(tickets, at),
    [tickets],
  );
  const now = useTickAt(nextChange);
  const { live, past } = useMemo(() => orderSavedTickets(tickets, now), [tickets, now]);

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      showsVerticalScrollIndicator={false}
    >
      <View
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: 'row',
          gap: spacing.sm,
          alignItems: 'flex-start',
          padding: spacing.md,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceMuted,
        }}
      >
        <Ionicons name="cloud-offline-outline" size={18} color={colors.textMuted} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label">Saved on this phone</Text>
          <Text variant="caption" tone="muted">
            We could not reach the server, so these are the tickets this phone kept. Anything booked
            elsewhere is not here.
          </Text>
        </View>
      </View>

      {live.map((ticket) => (
        <SavedTicketRow key={ticket.reference} ticket={ticket} now={now} />
      ))}

      {past.length > 0 && (
        <>
          {/* Separated rather than dropped: a used ticket is a receipt, and the
              only thing wrong with it was being mixed in with tonight's. */}
          <Text variant="overline" tone="muted" style={{ marginTop: spacing.sm }}>
            ALREADY WATCHED
          </Text>
          {past.map((ticket) => (
            <SavedTicketRow key={ticket.reference} ticket={ticket} now={now} spent />
          ))}
        </>
      )}

      <Button label="Try again" variant="secondary" loading={retrying} onPress={onRetry} />
    </ScrollView>
  );
}

function SavedTicketRow({
  ticket,
  now,
  spent = false,
}: {
  ticket: SavedTicket;
  now: number;
  spent?: boolean;
}) {
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();

  // Signed on purpose, so a show already under way reads "started 20m ago"
  // rather than "now". `minutesUntil` floors at zero, which is right for a
  // slot that has stopped selling and wrong for a ticket at a gate.
  //
  // Only ever for a ticket still in play, and only when the date parses: a
  // caption reading "in NaNm" is worse than no caption at all.
  const startsAt = Date.parse(ticket.startsAt);
  const countdown =
    spent || Number.isNaN(startsAt) ? null : formatMinutesUntil((startsAt - now) / 60_000);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        `${ticket.movieTitle}, ${ticket.seats}, booking ${ticket.reference}` +
        (countdown ? `, ${countdown}` : '')
      }
      onPress={() => router.push(`/booking/${ticket.reference}`)}
      style={({ pressed }) => ({
        padding: spacing.lg,
        gap: spacing.xs,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
        // Dimmed, not hidden: still tappable, still legible, no longer the
        // thing being looked for.
        opacity: spent ? 0.6 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
        <Text variant="heading" numberOfLines={2} style={{ flex: 1 }}>
          {ticket.movieTitle}
        </Text>
        {countdown && (
          <Text variant="caption" tone="primary" numeric numberOfLines={1}>
            {countdown}
          </Text>
        )}
      </View>
      <Text variant="caption" tone="muted">
        {formatMonthDay(ticket.startsAt)} · {formatTime(ticket.startsAt)} · {ticket.screen}
      </Text>
      <Text variant="caption" tone="muted">
        {ticket.cinema}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text variant="label">{ticket.seats}</Text>
        <Text variant="label" numeric>
          {ticket.reference}
        </Text>
      </View>
    </Pressable>
  );
}
