import { View } from 'react-native';
import { Text } from '../../components/ui';
import { useTheme } from '../../theme';

/** A labelled value on the ticket stub. */
export function Field({ label, value }: { label: string; value: string }) {
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
export function Perforation() {
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
