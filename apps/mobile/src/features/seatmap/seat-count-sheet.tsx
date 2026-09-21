import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text } from '../../components/ui';
import { useTheme } from '../../theme';

/**
 * Asked before the map opens, the way every Indian ticketing app asks it.
 *
 * It is not a formality. Knowing the party size lets the map cap the selection
 * honestly and lets the summary bar say something useful from the first tap,
 * instead of the user discovering the limit by hitting it.
 */
export function SeatCountSheet({
  visible,
  max,
  onSelect,
  onClose,
}: {
  visible: boolean;
  max: number;
  onSelect: (count: number) => void;
  onClose: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  // A booking is almost always a small party; ten tiny targets in a row would
  // be worse than a sensible cap.
  const options = Array.from({ length: Math.min(max, 10) }, (_, i) => i + 1);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* The backdrop dismisses on tap but is deliberately not a button: it
          wraps the sheet's own buttons, and a control nested inside a control
          is invalid on the web and ambiguous to a screen reader. The sheet
          carries its own labelled way out. */}
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

          <View style={{ gap: spacing.xs, alignItems: 'center' }}>
            <Text variant="title">How many seats?</Text>
            <Text variant="caption" tone="muted">
              Up to {max} in one booking
            </Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: spacing.md,
            }}
          >
            {options.map((count) => (
              <Pressable
                key={count}
                accessibilityRole="button"
                accessibilityLabel={`${count} seat${count === 1 ? '' : 's'}`}
                onPress={() => onSelect(count)}
                style={({ pressed }) => ({
                  width: 54,
                  height: 54,
                  borderRadius: 27,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: pressed ? colors.primary : colors.surface,
                })}
              >
                <Text variant="heading" numeric>
                  {count}
                </Text>
              </Pressable>
            ))}
          </View>

          <Button label="Just show me the map" variant="ghost" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
