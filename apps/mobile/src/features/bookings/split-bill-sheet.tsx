import { formatMoney, type BookingSplitShareInput } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text } from '../../components/ui';
import { tapFeedback } from '../../lib/haptics';
import { useTheme } from '../../theme';
import { HIT_SIZE } from '../../theme/tokens';

const MAX_PEOPLE = 8;

/** Splits `totalMinor` as evenly as a minor unit allows, handing the leftover
 * paise to the first few shares rather than rounding any of it away — the
 * sum always equals `totalMinor` exactly, which the server requires. */
function evenSplit(labels: string[], totalMinor: number): BookingSplitShareInput[] {
  const count = labels.length;
  const base = Math.floor(totalMinor / count);
  const remainder = totalMinor - base * count;
  return labels.map((label, index) => ({
    label: label.trim() || `Person ${index + 1}`,
    amountMinor: base + (index < remainder ? 1 : 0),
  }));
}

type FormProps = {
  totalMinor: number;
  currency: string;
  initialLabels: string[];
  busy: boolean;
  error: string | null;
  onSave: (shares: BookingSplitShareInput[]) => void;
};

/**
 * Mounted fresh each time the sheet opens (see `SplitBillSheet` below), so
 * `initialLabels` seeds `labels` once per open with no effect needed to reset
 * it — a cancelled edit never leaks into the next time this is opened.
 */
function SplitBillForm({ totalMinor, currency, initialLabels, busy, error, onSave }: FormProps) {
  const { colors, radius, spacing } = useTheme();
  const [labels, setLabels] = useState(initialLabels);
  const shares = evenSplit(labels, totalMinor);

  return (
    <>
      <View style={{ gap: spacing.sm }}>
        {labels.map((label, index) => (
          <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <TextInput
              value={label}
              onChangeText={(text) =>
                setLabels((prev) => prev.map((l, i) => (i === index ? text : l)))
              }
              placeholder={`Person ${index + 1}`}
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              style={{
                flex: 1,
                minHeight: HIT_SIZE,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.background,
                color: colors.text,
                fontSize: 15,
              }}
            />
            <Text variant="label" numeric style={{ width: 72, textAlign: 'right' }}>
              {formatMoney(shares[index]!.amountMinor, currency)}
            </Text>
            {labels.length > 2 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${label || `person ${index + 1}`}`}
                hitSlop={8}
                onPress={() => setLabels((prev) => prev.filter((_, i) => i !== index))}
              >
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        ))}

        {labels.length < MAX_PEOPLE ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add another person"
            onPress={() => {
              tapFeedback();
              setLabels((prev) => [...prev, '']);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
              paddingVertical: spacing.sm,
            }}
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            <Text variant="label" tone="primary">
              Add person
            </Text>
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Button label="Save split" loading={busy} onPress={() => onSave(shares)} />
    </>
  );
}

/**
 * Who's in, split evenly — the organiser already paid the whole bill through
 * the normal checkout, so there is nothing to collect here, only a shared
 * record of who owes what. Names are the only thing anyone types; the
 * amounts are always an even split, so there is nothing to typo into an
 * amount that cannot be saved.
 */
export function SplitBillSheet({
  visible,
  onClose,
  ...form
}: FormProps & { visible: boolean; onClose: () => void }) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessible={false}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' }}
      >
        <Pressable
          accessible={false}
          onPress={() => {}}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            paddingTop: spacing.sm,
            paddingBottom: insets.bottom + spacing.lg,
            paddingHorizontal: spacing.lg,
            gap: spacing.lg,
            maxHeight: '85%',
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.borderStrong,
            }}
          />

          <View style={{ gap: spacing.xs }}>
            <Text variant="title">Split the bill</Text>
            <Text variant="caption" tone="muted">
              You already paid {formatMoney(form.totalMinor, form.currency)}. This just keeps track
              of who owes you what.
            </Text>
          </View>

          {visible ? <SplitBillForm {...form} /> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
