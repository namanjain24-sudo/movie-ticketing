import { SHOW_FORMAT_LABELS, formatMoney } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Alert, Platform, ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { bookingApi } from '../../api/booking';
import { ErrorState, LoadingState } from '../../components/query-state';
import { Badge, Button, Text } from '../../components/ui';
import {
  cancelShowtimeReminder,
  requestNotificationPermissionIfUnasked,
  scheduleShowtimeReminder,
} from '../../features/notifications/notifications';
import { formatMonthDay, formatTime } from '../../lib/format';
import { queryKeys } from '../../lib/query-client';
import { useTheme } from '../../theme';
import { gradients, scannerBackground, scannerInk } from '../../theme/tokens';

export default function BookingTicket() {
  const { reference } = useLocalSearchParams<{ reference: string }>();
  const router = useRouter();
  const { colors, radius, spacing, elevation } = useTheme();
  const insets = useSafeAreaInsets();

  const queryClient = useQueryClient();
  const booking = useQuery({
    queryKey: queryKeys.booking(reference),
    queryFn: () => bookingApi.bookingByReference(reference),
    enabled: Boolean(reference),
  });

  const bookingId = booking.data?.id;

  // Quoted, never guessed: the user sees the exact refund before committing.
  const quote = useQuery({
    queryKey: queryKeys.cancellationQuote(bookingId ?? ''),
    queryFn: () => bookingApi.cancellationQuote(bookingId as string),
    enabled: Boolean(bookingId) && booking.data?.status === 'CONFIRMED',
  });

  const cancel = useMutation({
    mutationFn: () => bookingApi.cancelBooking(bookingId as string),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings });
      void booking.refetch();
      void quote.refetch();
      if (bookingId) void cancelShowtimeReminder(bookingId);
      notify(
        'Booking cancelled',
        `${formatMoney(result.refundMinor, result.currency)} goes back to your original payment method. ` +
          `The ${formatMoney(result.feeRetainedMinor, result.currency)} booking fee is not refunded.`,
      );
    },
    onError: (error) =>
      notify(
        'Could not cancel',
        error instanceof Error ? error.message : 'Please try again in a moment.',
      ),
  });

  // Re-runs on every refetch, not just the first confirmation — harmless,
  // since both calls are idempotent (same notification identifier, and the
  // OS itself remembers whether permission was already asked for).
  useEffect(() => {
    const data = booking.data;
    if (data?.status !== 'CONFIRMED') return;
    void requestNotificationPermissionIfUnasked().then(() => {
      void scheduleShowtimeReminder(data);
    });
  }, [booking.data]);

  if (booking.isPending) return <LoadingState label="Loading your ticket" />;

  if (booking.isError || !booking.data) {
    return (
      <ErrorState
        error={booking.error}
        title="Could not load this ticket"
        onRetry={() => void booking.refetch()}
      />
    );
  }

  const ticket = booking.data;
  const { showtime } = ticket;
  const cancelled = ticket.status === 'CANCELLED' || ticket.status === 'FAILED';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingTop: insets.top + spacing.xl,
          paddingBottom: insets.bottom + spacing.lg,
          gap: spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center', gap: spacing.sm }}>
          {cancelled ? (
            <Ionicons name="checkmark-circle" size={52} color={colors.success} />
          ) : (
            // The one gold moment in the app, spent here per DESIGN.md's
            // gradient token: this is the "won ticket" it was made for.
            <LinearGradient
              colors={gradients.gold}
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="checkmark" size={34} color={colors.onImage} />
            </LinearGradient>
          )}
          <Text variant="title">Booking confirmed</Text>
          <Text tone="muted" align="center">
            Show this at the counter or scan it at the gate.
          </Text>
        </View>

        {/* A ticket, not a card: a stub, a torn edge, and a code. */}
        <View style={[{ borderRadius: radius.lg, overflow: 'hidden' }, elevation.card]}>
          <View style={{ backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.sm }}>
            <Text variant="heading" numberOfLines={2}>
              {showtime.movie.title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Badge label={SHOW_FORMAT_LABELS[showtime.format]} tone="primary" />
              <Badge label={showtime.language} variant="outline" />
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm }}>
              <Field label="Date" value={formatMonthDay(showtime.startsAt)} />
              <Field label="Time" value={formatTime(showtime.startsAt)} />
              <Field label="Screen" value={showtime.screen.name} />
            </View>

            <Field
              label="Seats"
              value={ticket.seats.map((s) => `${s.rowLabel}${s.number}`).join(', ')}
            />
            <Field label="Cinema" value={`${showtime.cinema.name}, ${showtime.cinema.city}`} />
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
            {/* The scanner needs a real code, not the payload as text. White
                quiet zone in both themes: a scanner reads contrast, not taste. */}
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
          <Text tone="muted">{cancelled ? 'Refunded' : 'Paid'}</Text>
          <Text variant="label" numeric>
            {/* The booking fee is never refunded, and neither is money a promo
                code already took off, so a cancelled ticket shows what went back. */}
            {formatMoney(
              cancelled
                ? Math.max(0, ticket.subtotalMinor - ticket.discountMinor)
                : ticket.totalMinor,
              ticket.currency,
            )}
          </Text>
        </View>

        {ticket.discountMinor > 0 ? (
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingHorizontal: spacing.xs,
            }}
          >
            <Text tone="muted">Saved with {ticket.promoCode ?? 'a promo code'}</Text>
            <Text variant="label" numeric style={{ color: colors.success }}>
              {formatMoney(ticket.discountMinor, ticket.currency)}
            </Text>
          </View>
        ) : null}

        {cancelled ? (
          <View
            style={{
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceMuted,
            }}
          >
            <Text variant="label">This booking was cancelled</Text>
            <Text variant="caption" tone="muted">
              The seats went back on sale and the refund is with your bank.
            </Text>
          </View>
        ) : quote.data ? (
          <View style={{ gap: spacing.sm }}>
            {quote.data.cancellable ? (
              <>
                <Text variant="caption" tone="muted" align="center">
                  Cancel before {formatMonthDay(quote.data.deadline)},{' '}
                  {formatTime(quote.data.deadline)} to get back{' '}
                  {formatMoney(quote.data.refundMinor, quote.data.currency)}. The{' '}
                  {formatMoney(quote.data.feeRetainedMinor, quote.data.currency)} booking fee is not
                  refunded.
                </Text>
                <Button
                  label="Cancel booking"
                  variant="ghost"
                  destructive
                  loading={cancel.isPending}
                  onPress={() =>
                    confirmCancel(
                      formatMoney(quote.data.refundMinor, quote.data.currency),
                      formatMoney(quote.data.feeRetainedMinor, quote.data.currency),
                      () => cancel.mutate(),
                    )
                  }
                />
              </>
            ) : (
              <Text variant="caption" tone="muted" align="center">
                {quote.data.reason}
              </Text>
            )}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Button
            label="Share"
            variant="ghost"
            style={{ flex: 1 }}
            onPress={() =>
              void Share.share({
                message:
                  `${showtime.movie.title} · ${formatMonthDay(showtime.startsAt)}, ` +
                  `${formatTime(showtime.startsAt)}\n${showtime.cinema.name}, ${showtime.screen.name}\n` +
                  `Seats ${ticket.seats.map((s) => `${s.rowLabel}${s.number}`).join(', ')}\n` +
                  `Booking ${ticket.reference}`,
              })
            }
          />
          <Button
            label="Done"
            variant="secondary"
            style={{ flex: 1 }}
            onPress={() => router.replace('/(tabs)/bookings')}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="overline" tone="muted">
        {label.toUpperCase()}
      </Text>
      <Text variant="label">{value}</Text>
    </View>
  );
}

/** The torn edge. Two notches and a dashed rule, drawn rather than imagined. */
function Perforation() {
  const { colors, spacing } = useTheme();
  const NOTCH = 20;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        height: NOTCH,
      }}
    >
      <View
        style={{
          width: NOTCH,
          height: NOTCH,
          borderRadius: NOTCH / 2,
          backgroundColor: colors.background,
          marginLeft: -NOTCH / 2,
        }}
      />
      <View
        style={{
          flex: 1,
          borderBottomWidth: 1,
          borderStyle: 'dashed',
          borderColor: colors.borderStrong,
          marginHorizontal: spacing.sm,
        }}
      />
      <View
        style={{
          width: NOTCH,
          height: NOTCH,
          borderRadius: NOTCH / 2,
          backgroundColor: colors.background,
          marginRight: -NOTCH / 2,
        }}
      />
    </View>
  );
}

/**
 * Alert on a device, `confirm` on the web, because React Native's Alert is a
 * no-op there and a destructive action must never fire unconfirmed.
 */
function confirmCancel(refund: string, fee: string, onConfirm: () => void) {
  const body = `${refund} goes back to your original payment method. The ${fee} booking fee is not refunded, and your seats go back on sale.`;

  if (Platform.OS === 'web') {
    if (globalThis.confirm(`Cancel this booking?\n\n${body}`)) onConfirm();
    return;
  }

  Alert.alert('Cancel this booking?', body, [
    { text: 'Keep booking', style: 'cancel' },
    { text: 'Cancel booking', style: 'destructive', onPress: onConfirm },
  ]);
}

function notify(title: string, body: string) {
  if (Platform.OS === 'web') {
    globalThis.alert(`${title}\n\n${body}`);
    return;
  }
  Alert.alert(title, body);
}
