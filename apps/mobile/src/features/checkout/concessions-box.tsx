import { formatMoney, type ConcessionItem } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';
import { Poster, Text } from '../../components/ui';
import { tapFeedback } from '../../lib/haptics';
import { photoCreditLine } from './photo-credits';
import { useTheme } from '../../theme';

const MAX_QUANTITY = 10;

/**
 * Popcorn and drinks at checkout. Presentational, like `PromoBox`: the
 * checkout screen owns the quantities and the price, this owns only the list.
 *
 * Unlike a seat, an item here is never held or locked — there is no inventory
 * to protect, so the count is free to change until the moment of payment,
 * when the server prices it against the live menu one last time.
 */
export function ConcessionsBox({
  items,
  quantities,
  locked,
  onChange,
}: {
  items: ConcessionItem[];
  quantities: Record<string, number>;
  locked: boolean;
  onChange: (itemId: string, quantity: number) => void;
}) {
  const { colors, radius, spacing } = useTheme();

  if (items.length === 0) return null;
  if (locked && Object.values(quantities).every((q) => q === 0)) return null;

  // Built from the whole menu rather than the rows currently drawn, so the
  // line does not shuffle as quantities change. A locked order still shows
  // the photographs for what was bought, so it still owes the credit.
  const credits = photoCreditLine(items);

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="heading">Popcorn & drinks</Text>
      <View style={{ gap: spacing.xs }}>
        {items.map((item) => {
          const quantity = quantities[item.id] ?? 0;
          if (locked && quantity === 0) return null;
          return (
            <View
              key={item.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              {/* A picture of the thing, which is how every food list in this
                  market is read. `Poster` draws the item's initials when
                  there is no photograph, so a menu that is half-credited does
                  not look half-broken. */}
              {item.imageUrl && item.imageCredit ? (
                <Poster
                  uri={item.imageUrl}
                  title={item.name}
                  rounded={radius.sm}
                  sheen={false}
                  style={{ width: 56, height: 56 }}
                />
              ) : null}

              <View style={{ flex: 1, gap: 1 }}>
                <Text variant="label" numberOfLines={1}>
                  {item.name}
                </Text>
                {/* The price gets its own line rather than trailing the
                    description. Sharing one line, it was the half that got cut
                    when a photograph took the width: "Coke, Sprite or Thums
                    Up. · ₹1…". A description that runs out mid-sentence is a
                    description; a price that does is a trap. */}
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {item.description}
                </Text>
                <Text variant="caption" numeric>
                  {formatMoney(item.priceMinor, item.currency)}
                </Text>
              </View>

              {locked ? (
                <Text variant="label" numeric>
                  ×{quantity}
                </Text>
              ) : (
                <Stepper
                  quantity={quantity}
                  onChange={(next) => onChange(item.id, next)}
                  itemName={item.name}
                />
              )}
            </View>
          );
        })}
      </View>

      {/* Required, not decorative: these photographs are used under CC BY and
          CC BY-SA, which name the author as the condition of use. */}
      {credits ? (
        <Text variant="caption" tone="muted">
          {credits}
        </Text>
      ) : null}

      {/* An entitlement almost nobody knows they have, said where it is worth
          money: directly under a 500ml bottle this app is charging for.
          
          The Supreme Court's 2023 judgment let cinemas bar outside food and
          required them, in the same breath, to provide free drinking water.
          Stated as the fact it is, with no advice attached - the app is not
          in a position to give any, and the fact is enough.
          
          Only while something can still be bought. Once the order is locked
          this block is a receipt, and a receipt is the wrong place to tell
          somebody what they could have had instead. */}
      {!locked ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: spacing.sm,
            marginTop: spacing.xs,
          }}
        >
          <Ionicons name="water-outline" size={14} color={colors.accent} />
          <Text variant="caption" tone="muted" style={{ flex: 1 }}>
            Cinemas have to give you free drinking water if you ask. The Supreme Court required it
            in 2023, in the same judgment that let them bar outside food.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Stepper({
  quantity,
  onChange,
  itemName,
}: {
  quantity: number;
  onChange: (quantity: number) => void;
  itemName: string;
}) {
  const { spacing } = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <StepButton
        icon="remove"
        disabled={quantity === 0}
        accessibilityLabel={`Remove one ${itemName}`}
        onPress={() => {
          tapFeedback();
          onChange(Math.max(0, quantity - 1));
        }}
      />
      <Text variant="label" numeric style={{ width: 18, textAlign: 'center' }}>
        {quantity}
      </Text>
      <StepButton
        icon="add"
        disabled={quantity >= MAX_QUANTITY}
        accessibilityLabel={`Add one ${itemName}`}
        onPress={() => {
          tapFeedback();
          onChange(Math.min(MAX_QUANTITY, quantity + 1));
        }}
      />
    </View>
  );
}

function StepButton({
  icon,
  disabled,
  accessibilityLabel,
  onPress,
}: {
  icon: 'add' | 'remove';
  disabled: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={{
        width: 28,
        height: 28,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: disabled ? colors.border : colors.primary,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Ionicons name={icon} size={16} color={disabled ? colors.textMuted : colors.primary} />
    </Pressable>
  );
}
