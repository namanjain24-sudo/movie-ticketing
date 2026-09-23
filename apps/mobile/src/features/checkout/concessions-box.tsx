import { formatMoney, type ConcessionItem } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';
import { Text } from '../../components/ui';
import { tapFeedback } from '../../lib/haptics';
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
              <View style={{ flex: 1 }}>
                <Text variant="label">{item.name}</Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {item.description} · {formatMoney(item.priceMinor, item.currency)}
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
