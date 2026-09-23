import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '../../components/ui';
import { useTheme } from '../../theme';

export function RecentSearchChips({
  recent,
  onSelect,
  onClear,
}: {
  recent: string[];
  onSelect: (query: string) => void;
  onClear: () => void;
}) {
  const { colors, radius, spacing } = useTheme();

  if (recent.length === 0) return null;

  return (
    <View style={{ gap: spacing.xs, paddingHorizontal: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="caption" tone="muted">
          Recent searches
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Clear recent searches" onPress={onClear}>
          <Text variant="caption" tone="primary">
            Clear
          </Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {recent.map((query) => (
          <Pressable
            key={query}
            accessibilityRole="button"
            accessibilityLabel={`Search again for ${query}`}
            onPress={() => onSelect(query)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
          >
            <Ionicons name="time-outline" size={14} color={colors.textMuted} />
            <Text variant="label">{query}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
