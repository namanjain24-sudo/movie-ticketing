import { SEAT_TIER_LABELS, formatMoney, type CheckoutInput, type PromoQuote } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, View, type AppStateStatus } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bookingApi } from '../../api/booking';
import { concessionsApi } from '../../api/concessions';
import { promosApi } from '../../api/promos';
import { ApiRequestError } from '../../api/client';
import { ErrorState, LoadingState } from '../../components/query-state';
import { AppBar, Button, Card, Text } from '../../components/ui';
import { ConcessionsBox } from '../../features/checkout/concessions-box';
import { useCountdown } from '../../features/checkout/use-countdown';
import {
  cancelHoldExpiryNudge,
  scheduleHoldExpiryNudge,
} from '../../features/notifications/notifications';
import { PromoBox } from '../../features/promos/promo-box';
import { successFeedback } from '../../lib/haptics';
import { idempotencyKey } from '../../lib/idempotency';
import { queryKeys } from '../../lib/query-client';
import { useTheme } from '../../theme';
import { HIT_SIZE } from '../../theme/tokens';

type Method = CheckoutInput['method'];
const METHODS: {
  value: Method;
  label: string;
  hint: string;
  icon: 'card' | 'phone-portrait' | 'business';
}[] = [
  { value: 'CARD', label: 'Credit or debit card', hint: 'Visa, Mastercard, RuPay', icon: 'card' },
  { value: 'UPI', label: 'UPI', hint: 'Pay by any UPI app', icon: 'phone-portrait' },
  { value: 'NETBANKING', label: 'Netbanking', hint: 'All major banks', icon: 'business' },
];

/** How long to wait for the webhook before explaining the wait. */
const CONFIRM_TIMEOUT_MS = 20_000;

export default function Checkout() {
  const { holdId } = useLocalSearchParams<{ holdId: string }>();
  const router = useRouter();
  const { colors, radius, spacing, elevation } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [method, setMethod] = useState<Method>('CARD');
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [slowConfirm, setSlowConfirm] = useState(false);
  const [applied, setApplied] = useState<PromoQuote | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  /** Set once a booking exists: from then on the price is fixed, code or not. */
  const [priced, setPriced] = useState(false);

  const hold = useQuery({
    queryKey: queryKeys.hold(holdId),
    queryFn: () => bookingApi.hold(holdId),
    enabled: Boolean(holdId),
    refetchOnWindowFocus: true,
  });

  const offers = useQuery({
    queryKey: queryKeys.promoOffers,
    queryFn: promosApi.offers,
    staleTime: 5 * 60_000,
  });

  const concessions = useQuery({
    queryKey: queryKeys.concessions,
    queryFn: concessionsApi.list,
    staleTime: 5 * 60_000,
  });

  const addOnLines = Object.entries(quantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([itemId, quantity]) => ({ itemId, quantity }));
  const addOnsMinor = (concessions.data ?? []).reduce(
    (sum, item) => sum + item.priceMinor * (quantities[item.id] ?? 0),
    0,
  );

  const checkCode = useMutation({
    mutationFn: (code: string) => promosApi.validate({ holdId, code }),
    onSuccess: (quote) => {
      setPromoError(null);
      setApplied(quote);
      successFeedback();
    },
    onError: (error) => {
      setApplied(null);
      setPromoError(
        error instanceof ApiRequestError ? error.message : 'Could not check that code right now.',
      );
    },
  });

  const countdown = useCountdown(hold.data?.expiresAt, hold.data?.serverTime);

  /**
   * The countdown is only visible while the app is in the foreground. Someone
   * who backgrounds the app mid-checkout — a normal interruption, per
   * PRODUCT.md — gets a local nudge instead, timed to the same server-anchored
   * deadline the on-screen countdown uses. Coming back to the app cancels it:
   * the countdown itself is the reminder once it is back on screen.
   */
  useEffect(() => {
    const holdData = hold.data;
    if (!holdData || !holdId) return;

    const onChange = (next: AppStateStatus) => {
      if ((next === 'background' || next === 'inactive') && paymentId === null) {
        void scheduleHoldExpiryNudge(holdId, holdData.expiresAt, holdData.serverTime);
      } else if (next === 'active') {
        void cancelHoldExpiryNudge(holdId);
      }
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => {
      sub.remove();
      void cancelHoldExpiryNudge(holdId);
    };
  }, [hold.data, holdId, paymentId]);

  /**
   * Once a payment exists the client stops guessing and starts asking. This is
   * the ambiguous-submit path: the charge may already have gone through, so
   * nothing here retries the charge, it only reads its outcome.
   */
  const payment = useQuery({
    queryKey: queryKeys.payment(paymentId as string),
    queryFn: () => bookingApi.payment(paymentId as string),
    enabled: paymentId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.bookingStatus;
      return status === 'CONFIRMED' || status === 'FAILED' || status === 'CANCELLED' ? false : 1500;
    },
  });

  const settled = payment.data;
  const confirmedReference =
    settled?.bookingStatus === 'CONFIRMED' ? (settled.reference ?? null) : null;

  useEffect(() => {
    if (!confirmedReference) return;
    successFeedback();
    // The new ticket has to be in My bookings by the time the user looks.
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookings });
    // Replace, so the back gesture cannot return to a spent hold.
    router.replace(`/booking/${confirmedReference}`);
  }, [confirmedReference, router, queryClient]);

  // A payment that has not settled within the timeout gets an explanation
  // rather than a spinner that says nothing.
  useEffect(() => {
    if (paymentId === null) return;
    const timer = setTimeout(() => setSlowConfirm(true), CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [paymentId]);

  const keyRef = useRef<string | null>(null);
  const pay = useMutation({
    mutationFn: () => {
      keyRef.current ??= idempotencyKey('checkout');
      return bookingApi.checkout(
        {
          holdId,
          method,
          ...(applied ? { promoCode: applied.code } : {}),
          ...(addOnLines.length > 0 ? { addOns: addOnLines } : {}),
        },
        keyRef.current,
      );
    },
    onSuccess: (result) => {
      setPriced(true);
      setPaymentId(result.paymentId);
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.code === 'PROMO_INVALID') {
        // The code stopped being valid between the check and the payment. Nothing
        // was charged, so drop it and let the user see the price they will pay.
        setApplied(null);
        keyRef.current = null;
        setPromoError(error.message);
        return;
      }
      if (error instanceof ApiRequestError && error.code === 'HOLD_EXPIRED') {
        setFailure('Your hold ran out before the payment went through. The seats are free again.');
        return;
      }
      setFailure(
        error instanceof ApiRequestError ? error.message : 'The payment could not be started.',
      );
    },
  });

  if (hold.isPending) return <LoadingState label="Loading your hold" />;

  if (hold.isError || !hold.data) {
    return (
      <ErrorState
        error={hold.error}
        title="Could not load your hold"
        onRetry={() => void hold.refetch()}
      />
    );
  }

  const held = hold.data;
  const totalMinor = (applied ? applied.totalMinor : held.totalMinor) + addOnsMinor;
  const expired = countdown.hasExpired || held.status === 'EXPIRED' || held.status === 'RELEASED';
  const waiting = paymentId !== null && settled?.bookingStatus !== 'FAILED';
  const declined =
    settled?.bookingStatus === 'FAILED' || settled?.bookingStatus === 'CANCELLED'
      ? (settled.failureReason ?? 'The payment was declined.')
      : null;

  // The hold is gone. There is nothing to pay for, so the screen stops being a
  // checkout and becomes a way back to the map.
  if (expired && !waiting) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <AppBar title="Seats released" onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md }}>
          <Ionicons name="time-outline" size={44} color={colors.textMuted} />
          <Text variant="title">Your seats were released</Text>
          <Text tone="muted">
            Holds last a few minutes so seats cannot sit in a basket forever. Nothing was charged.
          </Text>
          <Button
            label="Choose seats again"
            style={{ marginTop: spacing.md }}
            onPress={() => router.replace(`/showtime/${held.showtimeId}`)}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppBar title="Checkout" onBack={() => router.back()} />

      {/* The deadline is the most important fact on this screen, so it sits
          above the content rather than inside it. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          paddingVertical: spacing.sm,
          backgroundColor: countdown.isUrgent ? colors.primary : colors.surfaceMuted,
        }}
      >
        <Ionicons
          name="timer-outline"
          size={16}
          color={countdown.isUrgent ? colors.onPrimary : colors.textMuted}
        />
        <Text
          variant="label"
          numeric
          accessibilityLiveRegion="polite"
          style={{ color: countdown.isUrgent ? colors.onPrimary : colors.textMuted }}
        >
          Seats held for {countdown.label}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        <Card>
          <Text variant="heading">Your seats</Text>
          {held.seats.map((seat) => (
            <View
              key={seat.showSeatId}
              style={{ flexDirection: 'row', justifyContent: 'space-between' }}
            >
              <Text tone="muted">
                {seat.rowLabel}
                {seat.number} · {SEAT_TIER_LABELS[seat.tier]}
              </Text>
              <Text numeric>{formatMoney(seat.priceMinor, held.currency)}</Text>
            </View>
          ))}

          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.sm }} />

          <Row label="Subtotal" value={formatMoney(held.subtotalMinor, held.currency)} />
          <Row label="Booking fee" value={formatMoney(held.feeMinor, held.currency)} />
          {addOnsMinor > 0 ? (
            <Row label="Snacks & drinks" value={formatMoney(addOnsMinor, held.currency)} />
          ) : null}
          {applied ? (
            <Row
              label={`Discount (${applied.code})`}
              value={`− ${formatMoney(applied.discountMinor, held.currency)}`}
              positive
            />
          ) : null}
          <Row label="Total" value={formatMoney(totalMinor, held.currency)} strong />
        </Card>

        <ConcessionsBox
          items={concessions.data ?? []}
          quantities={quantities}
          locked={priced}
          onChange={(itemId, quantity) =>
            setQuantities((prev) => ({ ...prev, [itemId]: quantity }))
          }
        />

        <PromoBox
          offers={offers.data ?? []}
          applied={applied}
          busy={checkCode.isPending}
          error={promoError}
          locked={priced}
          onApply={(code) => {
            // The key is bound to the request body, and the code is part of it.
            // A different code is a different request, so it earns a new key.
            keyRef.current = null;
            checkCode.mutate(code);
          }}
          onRemove={() => {
            keyRef.current = null;
            setApplied(null);
            setPromoError(null);
          }}
        />

        <View style={{ gap: spacing.sm }}>
          <Text variant="heading">Pay with</Text>
          {METHODS.map(({ value, label, hint, icon }) => {
            const selected = value === method;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: waiting }}
                disabled={waiting}
                onPress={() => setMethod(value)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  minHeight: HIT_SIZE + 16,
                  paddingHorizontal: spacing.lg,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  backgroundColor: colors.surface,
                  borderColor: selected ? colors.primary : colors.border,
                  opacity: waiting ? 0.5 : 1,
                }}
              >
                <Ionicons
                  name={icon}
                  size={20}
                  color={selected ? colors.primary : colors.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text variant="label">{label}</Text>
                  <Text variant="caption" tone="muted">
                    {hint}
                  </Text>
                </View>
                <Ionicons
                  name={selected ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={selected ? colors.primary : colors.borderStrong}
                />
              </Pressable>
            );
          })}
        </View>

        {declined ? (
          <Card style={{ borderColor: colors.danger }}>
            <Text variant="label" tone="danger">
              Payment declined
            </Text>
            <Text tone="muted">{declined}</Text>
            <Text tone="muted" variant="caption">
              Your seats are still held. Try a different method.
            </Text>
          </Card>
        ) : null}

        {failure ? (
          <Card style={{ borderColor: colors.danger }}>
            <Text tone="danger">{failure}</Text>
          </Card>
        ) : null}

        {slowConfirm && waiting && !declined ? (
          <Card>
            <Text variant="label">Still confirming</Text>
            <Text tone="muted">
              The payment went through and we are waiting on the bank to confirm it. Do not pay
              again; your booking will appear under Tickets.
            </Text>
          </Card>
        ) : null}
      </ScrollView>

      <View
        style={[
          {
            backgroundColor: colors.surface,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: insets.bottom + spacing.md,
            gap: spacing.sm,
          },
          elevation.raised,
        ]}
      >
        <Button
          label={
            waiting && !declined
              ? 'Confirming payment'
              : declined
                ? 'Try again'
                : `Pay ${formatMoney(totalMinor, held.currency)}`
          }
          emphasis="commit"
          loading={pay.isPending || (waiting && !declined)}
          disabled={expired}
          onPress={() => {
            setFailure(null);
            // A declined payment is a new attempt, so it earns a new key.
            if (declined) {
              keyRef.current = null;
              setPaymentId(null);
              setSlowConfirm(false);
            }
            pay.mutate();
          }}
        />
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  strong,
  positive,
}: {
  label: string;
  value: string;
  strong?: boolean;
  positive?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text variant={strong ? 'label' : 'body'} tone={strong ? 'default' : 'muted'}>
        {label}
      </Text>
      <Text
        variant={strong ? 'label' : 'body'}
        numeric
        style={positive ? { color: colors.success } : undefined}
      >
        {value}
      </Text>
    </View>
  );
}
