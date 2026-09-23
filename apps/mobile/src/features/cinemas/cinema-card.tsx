import type { CinemaDirectoryEntry } from '@app/shared';
import { formatMoney } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';
import { Text } from '../../components/ui';
import { tapFeedback } from '../../lib/haptics';
import { callNumber, formatDistance, openDirections } from '../../lib/maps';
import { AnimatedPressable, usePressScale } from '../../lib/use-press-scale';
import { useTheme } from '../../theme';
import { HIT_SIZE } from '../../theme/tokens';

/** How many facilities fit on a card before the row starts wrapping badly. */
const AMENITY_LIMIT = 3;

export function CinemaCard({
  cinema,
  onPress,
}: {
  cinema: CinemaDirectoryEntry;
  onPress: () => void;
}) {
  const { colors, radius, spacing, elevation } = useTheme();
  const distance = formatDistance(cinema.distanceKm);
  const press = usePressScale();

  const place = {
    latitude: cinema.latitude,
    longitude: cinema.longitude,
    label: cinema.name,
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`${cinema.name}, ${cinema.address}${
        distance ? `, ${distance} away` : ''
      }`}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.lg,
          padding: spacing.lg,
          gap: spacing.md,
        },
        elevation.card,
        press.style,
      ]}
    >
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: spacing['2xs'] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text variant="overline" tone="primary">
              {cinema.brand.toUpperCase()}
            </Text>
            {distance ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing['2xs'] }}>
                <Ionicons name="navigate" size={11} color={colors.accent} />
                <Text variant="caption" numeric style={{ color: colors.accent }}>
                  {distance}
                </Text>
              </View>
            ) : null}
          </View>

          <Text variant="heading" numberOfLines={2}>
            {cinema.name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {cinema.address}
          </Text>
        </View>

        {cinema.fromPriceMinor !== null ? (
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="overline" tone="muted">
              FROM
            </Text>
            <Text variant="heading" numeric>
              {formatMoney(cinema.fromPriceMinor, 'INR')}
            </Text>
          </View>
        ) : null}
      </View>

      {cinema.amenities.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {cinema.amenities.slice(0, AMENITY_LIMIT).map((amenity) => (
            <View
              key={amenity}
              style={{
                paddingHorizontal: spacing.sm,
                paddingVertical: 3,
                borderRadius: radius.full,
                backgroundColor: colors.surfaceMuted,
              }}
            >
              <Text variant="caption" tone="muted">
                {amenity}
              </Text>
            </View>
          ))}
          {cinema.amenities.length > AMENITY_LIMIT ? (
            <View
              style={{
                paddingHorizontal: spacing.sm,
                paddingVertical: 3,
                borderRadius: radius.full,
                backgroundColor: colors.surfaceMuted,
              }}
            >
              <Text variant="caption" tone="muted" numeric>
                +{cinema.amenities.length - AMENITY_LIMIT}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: spacing.sm,
        }}
      >
        <Text variant="caption" tone="muted" numeric style={{ flex: 1 }}>
          {cinema.screenCount} {cinema.screenCount === 1 ? 'screen' : 'screens'}
          {cinema.nowShowingCount > 0 ? ` · ${cinema.nowShowingCount} films on` : ' · nothing on'}
        </Text>

        {/* Deliberately not wrapped in the card's own press target: these go
            somewhere else entirely, and a tap that opens Google Maps when the
            user meant to open the cinema is a bad surprise. */}
        <IconAction
          icon="navigate-outline"
          label={`Directions to ${cinema.name}`}
          onPress={() => void openDirections(place)}
        />
        {cinema.phone ? (
          <IconAction
            icon="call-outline"
            label={`Call ${cinema.name}`}
            onPress={() => void callNumber(cinema.phone!)}
          />
        ) : null}
      </View>
    </AnimatedPressable>
  );
}

function IconAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: HIT_SIZE - 8,
        height: HIT_SIZE - 8,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.accentMuted : colors.surfaceMuted,
      })}
    >
      <Ionicons name={icon} size={18} color={colors.accent} />
    </Pressable>
  );
}
