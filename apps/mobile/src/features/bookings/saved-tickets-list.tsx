import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { Button, Text } from '../../components/ui';
import { formatMonthDay, formatTime } from '../../lib/format';
import { useTheme } from '../../theme';
import type { SavedTicket } from './ticket-vault';

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
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();

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

      {tickets.map((ticket) => (
        <Pressable
          key={ticket.reference}
          accessibilityRole="button"
          accessibilityLabel={`${ticket.movieTitle}, ${ticket.seats}, booking ${ticket.reference}`}
          onPress={() => router.push(`/booking/${ticket.reference}`)}
          style={({ pressed }) => ({
            padding: spacing.lg,
            gap: spacing.xs,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
          })}
        >
          <Text variant="heading" numberOfLines={2}>
            {ticket.movieTitle}
          </Text>
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
      ))}

      <Button label="Try again" variant="secondary" loading={retrying} onPress={onRetry} />
    </ScrollView>
  );
}
