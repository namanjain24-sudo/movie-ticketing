import { formatMoney, type PromoOffer, type PromoQuote } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Button, Card, Text } from '../../components/ui';
import { useTheme } from '../../theme';
import { HIT_SIZE } from '../../theme/tokens';

/**
 * Where a promo code is typed, checked and shown to be working.
 *
 * Presentational on purpose: the screen owns the request and the price, this
 * owns only the box. It has three states — empty, applied, and locked (a
 * payment has started, so the price is fixed and the code can no longer change).
 */
export function PromoBox({
  offers,
  applied,
  busy,
  error,
  locked,
  onApply,
  onRemove,
}: {
  offers: PromoOffer[];
  applied: PromoQuote | null;
  busy: boolean;
  error: string | null;
  locked: boolean;
  onApply: (code: string) => void;
  onRemove: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const [code, setCode] = useState('');
  const trimmed = code.trim();

  if (applied) {
    return (
      <Card style={{ borderColor: colors.success }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Ionicons name="pricetag" size={20} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text variant="label">{applied.code} applied</Text>
            <Text variant="caption" tone="muted">
              You save {formatMoney(applied.discountMinor, applied.currency)}
            </Text>
          </View>
          {locked ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove code ${applied.code}`}
              hitSlop={8}
              onPress={onRemove}
            >
              <Text variant="label" tone="primary">
                Remove
              </Text>
            </Pressable>
          )}
        </View>
      </Card>
    );
  }

  if (locked) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="heading">Promo code</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="Enter code"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          accessibilityLabel="Promo code"
          onSubmitEditing={() => trimmed && onApply(trimmed)}
          style={{
            flex: 1,
            minHeight: HIT_SIZE,
            paddingHorizontal: spacing.md,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: error ? colors.danger : colors.border,
            backgroundColor: colors.surface,
            color: colors.text,
            fontSize: 15,
            letterSpacing: 1,
          }}
        />
        <Button
          label="Apply"
          variant="secondary"
          loading={busy}
          disabled={trimmed.length === 0}
          onPress={() => onApply(trimmed)}
        />
      </View>

      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      {offers.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm }}
          keyboardShouldPersistTaps="handled"
        >
          {offers.map((offer) => (
            <Pressable
              key={offer.code}
              accessibilityRole="button"
              accessibilityLabel={`Use code ${offer.code}. ${offer.description}`}
              onPress={() => {
                setCode(offer.code);
                onApply(offer.code);
              }}
              style={{
                width: 200,
                gap: spacing['2xs'],
                padding: spacing.md,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: colors.borderStrong,
                backgroundColor: colors.surface,
              }}
            >
              <Text variant="label" tone="primary">
                {offer.code}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={2}>
                {offer.description}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
