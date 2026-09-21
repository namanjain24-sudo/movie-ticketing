import { View } from 'react-native';
import { Text } from '../../components/ui';
import { useTheme } from '../../theme';

/** A rule that starts at the accent and fades, so sections read as sections. */
export function SectionHeader({ title, note }: { title: string; note?: string }) {
  const { colors, spacing } = useTheme();

  return (
    <View style={{ paddingHorizontal: spacing.lg, gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ width: 3, height: 18, borderRadius: 2, backgroundColor: colors.primary }} />
        <Text variant="title">{title}</Text>
      </View>
      {note ? (
        <Text variant="caption" tone="muted" style={{ paddingLeft: spacing.md }}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}
