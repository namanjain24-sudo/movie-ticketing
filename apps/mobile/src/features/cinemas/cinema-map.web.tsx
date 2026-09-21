import type { CinemaDirectoryEntry } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View, type ViewStyle } from 'react-native';
import { Text } from '../../components/ui';
import { openPlace } from '../../lib/maps';
import { useTheme } from '../../theme';
import type { Coords } from './use-location';

/**
 * The web stand-in for the native map.
 *
 * `react-native-maps` is a wrapper around two native SDKs and has no web
 * implementation, so on web this component would otherwise fail to resolve and
 * take the whole route down with it. Metro picks this file for `platform=web`
 * by extension, which keeps the failure from ever happening rather than
 * catching it afterwards.
 *
 * It deliberately does not substitute an embedded web map. That would need a
 * billed Google Maps JavaScript key for a target this app is not shipped on.
 * What a reader on the web actually wants from a map is the location, and
 * every one of these rows hands it to them in the tool they would have used
 * anyway.
 */
export function CinemaMap({
  cinemas,
  origin: _origin,
  selectedId,
  onSelect,
  style,
}: {
  cinemas: CinemaDirectoryEntry[];
  origin: Coords | null;
  selectedId?: string;
  onSelect?: (cinema: CinemaDirectoryEntry) => void;
  style?: ViewStyle;
}) {
  const { colors, radius, spacing } = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: colors.surfaceMuted,
          padding: spacing.md,
          gap: spacing.sm,
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text variant="overline" tone="muted">
        LOCATIONS
      </Text>

      {cinemas.slice(0, 4).map((cinema) => (
        <Pressable
          key={cinema.id}
          accessibilityRole="link"
          accessibilityLabel={`Open ${cinema.name} in Google Maps`}
          onPress={() => {
            onSelect?.(cinema);
            void openPlace({
              latitude: cinema.latitude,
              longitude: cinema.longitude,
              label: cinema.name,
            });
          }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: radius.md,
            backgroundColor: cinema.id === selectedId ? colors.accentMuted : colors.surface,
          }}
        >
          <Ionicons name="location" size={16} color={colors.primary} />
          <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>
            {cinema.name}
          </Text>
          <Ionicons name="open-outline" size={14} color={colors.textMuted} />
        </Pressable>
      ))}

      {cinemas.length > 4 ? (
        <Text variant="caption" tone="muted" numeric>
          and {cinemas.length - 4} more in the list below
        </Text>
      ) : null}
    </View>
  );
}
