import { EVENT_KIND_SINGULAR, SHOW_FORMAT_LABELS, formatMoney } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ScrollView, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Button, Text } from '../../components/ui';
import { formatMonthDay, formatTime } from '../../lib/format';
import { useTheme } from '../../theme';
import { scannerBackground, scannerInk } from '../../theme/tokens';
import { Field, Perforation } from './ticket-parts';
import type { SavedTicket } from './ticket-vault';

/** "two minutes ago", roughly, which is all this needs to be. */
function since(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'a moment ago';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * The ticket as it was last seen, shown when the server cannot be reached.
 *
 * Deliberately a different screen rather than the live one with a banner on
 * top. It is missing things the live ticket has — the cancel control, the
 * refund quote, the split, the calendar button — and every one of those needs
 * a server to mean anything. Showing them greyed out would be a worse lie than
 * leaving them out.
 *
 * It says when the copy was taken instead of claiming it is current, because
 * it cannot know: a booking cancelled from another device would still be
 * sitting here saying CONFIRMED. What it can promise is the part that matters
 * at a gate, which is that the code in the square is the real signed one and a
 * scanner will accept it or not entirely on its own.
 */
export function SavedTicketCard({ ticket, onRetry }: { ticket: SavedTicket; onRetry: () => void }) {
  const { colors, radius, spacing, elevation } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingTop: insets.top + spacing.xl,
          paddingBottom: insets.bottom + spacing.lg,
          gap: spacing.lg,
        }}
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
            <Text variant="label">Saved copy</Text>
            <Text variant="caption" tone="muted">
              We could not reach the server, so this is your ticket as it was{' '}
              {since(ticket.savedAt)}. The code still scans.
            </Text>
          </View>
        </View>

        <View style={[{ borderRadius: radius.lg, overflow: 'hidden' }, elevation.card]}>
          <View style={{ backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.sm }}>
            <Text variant="heading" numberOfLines={2}>
              {ticket.movieTitle}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              {/* The same split as the live ticket: one badge names what it
                  is, the other gives the language a film has and an event
                  does not. */}
              <Badge
                label={
                  ticket.eventKind
                    ? EVENT_KIND_SINGULAR[ticket.eventKind]
                    : SHOW_FORMAT_LABELS[ticket.format]
                }
                tone="primary"
              />
              {ticket.eventKind ? null : <Badge label={ticket.language} variant="outline" />}
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm }}>
              <Field label="Date" value={formatMonthDay(ticket.startsAt)} />
              <Field label="Time" value={formatTime(ticket.startsAt)} />
              <Field label="Screen" value={ticket.screen} />
            </View>

            <Field label="Seats" value={ticket.seats} />
            <Field label="Cinema" value={ticket.cinema} />
          </View>

          <Perforation />

          <View
            style={{
              backgroundColor: colors.surface,
              padding: spacing.lg,
              alignItems: 'center',
              gap: spacing.sm,
            }}
          >
            <Text variant="overline" tone="muted">
              BOOKING REFERENCE
            </Text>
            <Text variant="display" numeric selectable style={{ letterSpacing: 2 }}>
              {ticket.reference}
            </Text>
            <View
              style={{
                padding: spacing.md,
                borderRadius: radius.md,
                backgroundColor: scannerBackground,
              }}
            >
              <QRCode
                value={ticket.qrPayload}
                size={168}
                backgroundColor={scannerBackground}
                color={scannerInk}
              />
            </View>
            <Text variant="caption" tone="muted" align="center">
              Signed, so the gate can verify it without a connection.
            </Text>
          </View>
        </View>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.xs,
          }}
        >
          <Text tone="muted">Paid</Text>
          <Text variant="label" numeric>
            {formatMoney(ticket.totalMinor, ticket.currency)}
          </Text>
        </View>

        <Button label="Try again" variant="secondary" onPress={onRetry} />
      </ScrollView>
    </View>
  );
}
