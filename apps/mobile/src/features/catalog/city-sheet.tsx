import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../components/ui';
import { useTheme } from '../../theme';
import { HIT_SIZE } from '../../theme/tokens';

const ALL = 'All cities';

/**
 * Choosing a city changes what the whole app is about, which is the one case on
 * this screen that earns an interruption.
 */
export function CitySheet({
  visible,
  cities,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  cities: string[];
  value?: string;
  onChange: (next?: string) => void;
  onClose: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const options: (string | undefined)[] = [undefined, ...cities];

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
        {/* Stops a tap inside the sheet from closing it. */}
        <Pressable
          accessible={false}
          onPress={() => {}}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            paddingTop: spacing.sm,
            paddingBottom: insets.bottom + spacing.lg,
            maxHeight: '70%',
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.borderStrong,
              marginBottom: spacing.lg,
            }}
          />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: spacing.lg,
            }}
          >
            <Text variant="heading">Select your city</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={8}
            >
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingVertical: spacing.sm }}>
            {options.map((city) => {
              const selected = city === value;
              return (
                <Pressable
                  key={city ?? ALL}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    onChange(city);
                    onClose();
                  }}
                  style={({ pressed }) => ({
                    minHeight: HIT_SIZE + 8,
                    paddingHorizontal: spacing.lg,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
                  })}
                >
                  <Text variant={selected ? 'label' : 'body'}>{city ?? ALL}</Text>
                  {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
