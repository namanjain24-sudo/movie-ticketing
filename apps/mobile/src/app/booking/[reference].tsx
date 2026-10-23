import { POINT_VALUE_MINOR, SHOW_FORMAT_LABELS, formatMoney } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Alert, Platform, Pressable, ScrollView, Share, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { bookingApi } from '../../api/booking';
import { ErrorState } from '../../components/query-state';
import { Badge, Button, Card, Skeleton, Text } from '../../components/ui';
import { addShowtimeToCalendar } from '../../lib/calendar';
import { SplitBillSheet } from '../../features/bookings/split-bill-sheet';
import {
  cancelShowtimeReminder,
  requestNotificationPermissionIfUnasked,
  scheduleShowtimeReminder,
} from '../../features/notifications/notifications';
import { formatMonthDay, formatTime } from '../../lib/format';
import { notify } from '../../lib/notify';
import { queryKeys } from '../../lib/query-client';
import { shareLink } from '../../lib/share-link';
import { successFeedback, tapFeedback } from '../../lib/haptics';
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

  const [splitSheetOpen, setSplitSheetOpen] = useState(false);

  const split = useQuery({
    queryKey: queryKeys.bookingSplit(bookingId ?? ''),
    queryFn: () => bookingApi.getSplit(bookingId as string),
    enabled: Boolean(bookingId) && booking.data?.status === 'CONFIRMED',
  });

  const [splitError, setSplitError] = useState<string | null>(null);
  const saveSplit = useMutation({
    mutationFn: (shares: Parameters<typeof bookingApi.setSplit>[1]) =>
      bookingApi.setSplit(bookingId as string, shares),
    onSuccess: (result) => {
      setSplitError(null);
      setSplitSheetOpen(false);
      queryClient.setQueryData(queryKeys.bookingSplit(bookingId as string), result);
      successFeedback();
    },
    onError: (error) =>
      setSplitError(error instanceof Error ? error.message : 'Could not save that split.'),
  });

  const toggleShare = useMutation({
    mutationFn: (params: { shareId: string; settled: boolean }) =>
      bookingApi.toggleSplitShare(bookingId as string, params.shareId, params.settled),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.bookingSplit(bookingId as string), result);
    },
    // Without this a failed tap did nothing visible at all: the checkbox
    // simply did not move, which reads as an unresponsive control rather than
    // as a request that failed. `saveSplit` next to it already says so.
    onError: (error) =>
      setSplitError(
        error instanceof Error ? error.message : 'Could not update that share. Try again.',
      ),
  });

  const addToCalendar = useMutation({
    mutationFn: () => addShowtimeToCalendar(booking.data!),
    onSuccess: (result) => {
      if (result === 'added') {
        notify('Added to calendar', `${booking.data?.showtime.movie.title} is on your calendar.`);
      } else if (result === 'permission-denied') {
        notify('No calendar access', 'Allow calendar access in Settings to add this showtime.');
      } else if (result === 'unsupported') {
        notify('Not available', 'Adding to the calendar is not supported on this device.');
      } else {
        notify('Could not add to calendar', 'Please try again in a moment.');
      }
    },
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

  if (booking.isPending) return <BookingTicketSkeleton />;

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
  // `discountMinor` is the two folded together; the points portion is exact
  // (pointsRedeemed is in the same minor units a promo discount is), so
  // whatever is left over is the promo code's share.
  const promoPortionMinor = ticket.discountMinor - ticket.pointsRedeemed * POINT_VALUE_MINOR;

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
            // gradient token: this is the "won ticket" it was made for. It
            // earns the second authored spring in the app — the same
            // vocabulary as the seatmap's selection — because this is the
            // matching emotional beat, reward rather than choice.
            <Animated.View entering={ZoomIn.springify().damping(12).mass(0.6)}>
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
            </Animated.View>
          )}
          <Text variant="title">Booking confirmed</Text>
          <Text tone="muted" align="center">
            Show this at the counter or scan it at the gate.
          </Text>
        </View>

        {/* A ticket, not a card: a stub, a torn edge, and a code. Slides up
            after the checkmark settles, as though it were just printed. */}
        <Animated.View
          entering={cancelled ? undefined : FadeInDown.delay(120).duration(360)}
          style={[{ borderRadius: radius.lg, overflow: 'hidden' }, elevation.card]}
        >
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
        </Animated.View>

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

        {promoPortionMinor > 0 ? (
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingHorizontal: spacing.xs,
            }}
          >
            <Text tone="muted">Saved with {ticket.promoCode ?? 'a promo code'}</Text>
            <Text variant="label" numeric style={{ color: colors.success }}>
              {formatMoney(promoPortionMinor, ticket.currency)}
            </Text>
          </View>
        ) : null}

        {ticket.pointsRedeemed > 0 ? (
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingHorizontal: spacing.xs,
            }}
          >
            <Text tone="muted">
              Redeemed {ticket.pointsRedeemed} point{ticket.pointsRedeemed === 1 ? '' : 's'}
            </Text>
            <Text variant="label" numeric style={{ color: colors.success }}>
              {formatMoney(ticket.pointsRedeemed * POINT_VALUE_MINOR, ticket.currency)}
            </Text>
          </View>
        ) : null}

        {!cancelled && ticket.pointsEarned > 0 ? (
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingHorizontal: spacing.xs,
            }}
          >
            <Text tone="muted">Points earned</Text>
            <Text variant="label" numeric style={{ color: colors.accent }}>
              +{ticket.pointsEarned}
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

        {cancelled ? null : (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Ionicons name="people-outline" size={20} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text variant="label">Split the bill</Text>
                <Text variant="caption" tone="muted">
                  {split.data && split.data.shares.length > 0
                    ? `${split.data.shares.filter((s) => s.settled).length} of ${
                        split.data.shares.length
                      } paid you back`
                    : 'Keep track of who owes you what.'}
                </Text>
              </View>
              <Button
                label={split.data && split.data.shares.length > 0 ? 'Edit' : 'Split'}
                variant="secondary"
                size="sm"
                onPress={() => setSplitSheetOpen(true)}
              />
            </View>

            {split.data && split.data.shares.length > 0 ? (
              <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                {split.data.shares.map((share) => (
                  <Pressable
                    key={share.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: share.settled }}
                    accessibilityLabel={`${share.label}, ${formatMoney(share.amountMinor, ticket.currency)}${share.settled ? ', paid' : ', not paid'}`}
                    onPress={() => {
                      tapFeedback();
                      toggleShare.mutate({ shareId: share.id, settled: !share.settled });
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
                  >
                    <Ionicons
                      name={share.settled ? 'checkbox' : 'square-outline'}
                      size={18}
                      color={share.settled ? colors.success : colors.textMuted}
                    />
                    <Text
                      variant="label"
                      numberOfLines={1}
                      style={{
                        flex: 1,
                        textDecorationLine: share.settled ? 'line-through' : 'none',
                        color: share.settled ? colors.textMuted : colors.text,
                      }}
                    >
                      {share.label}
                    </Text>
                    <Text variant="caption" numeric tone="muted">
                      {formatMoney(share.amountMinor, ticket.currency)}
                    </Text>
                  </Pressable>
                ))}
                <Button
                  label="Remind them"
                  variant="ghost"
                  onPress={() => {
                    const lines = split.data.shares.map(
                      (s) =>
                        `${s.label}: ${formatMoney(s.amountMinor, ticket.currency)}${s.settled ? ' (paid)' : ''}`,
                    );
                    void Share.share({
                      message:
                        `Splitting ${showtime.movie.title}:\n${lines.join('\n')}\n` +
                        shareLink(`/booking/${ticket.reference}`),
                    });
                  }}
                />
              </View>
            ) : null}
          </Card>
        )}

        {cancelled ? null : (
          <Button
            label="Add to calendar"
            variant="secondary"
            loading={addToCalendar.isPending}
            onPress={() => addToCalendar.mutate()}
          />
        )}

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
                  `Booking ${ticket.reference}\n${shareLink(`/booking/${ticket.reference}`)}`,
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

      <SplitBillSheet
        visible={splitSheetOpen}
        totalMinor={ticket.totalMinor}
        currency={ticket.currency}
        initialLabels={
          split.data && split.data.shares.length > 0
            ? split.data.shares.map((s) => s.label)
            : ['Me', '']
        }
        busy={saveSplit.isPending}
        error={splitError}
        onClose={() => setSplitSheetOpen(false)}
        onSave={(shares) => saveSplit.mutate(shares)}
      />
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

/** Shaped like the ticket itself: the checkmark circle, then the stub —
 * matches what's about to render rather than a spinner with no relation to
 * the thing being waited for. */
function BookingTicketSkeleton() {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingTop: insets.top + spacing.xl,
          gap: spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center', gap: spacing.sm }}>
          <Skeleton style={{ width: 64, height: 64, borderRadius: 32 }} />
          <Skeleton style={{ width: 160, height: 20, borderRadius: 6 }} />
        </View>
        <Skeleton style={{ height: 320, borderRadius: radius.lg }} />
        <Skeleton style={{ height: 44, borderRadius: radius.md }} />
      </ScrollView>
    </View>
  );
}
