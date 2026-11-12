import type { CinemaDirectoryEntry } from '@app/shared';
import { VENUE_PROGRAMME_LABELS, VENUE_SPACE_LABELS, formatMoney } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';
import { Text } from '../../components/ui';
import { tapFeedback } from '../../lib/haptics';
import { callNumber, formatDistance, openDirections } from '../../lib/maps';
import { AnimatedPressable, usePressScale } from '../../lib/use-press-scale';
import { useTheme } from '../../theme';
import { brandInitials, brandTint } from './brand-mark';
import { HIT_SIZE } from '../../theme/tokens';
import { useFavoriteCinemas } from './use-favorite-cinemas';

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
  const spaces = VENUE_SPACE_LABELS[cinema.kind];
  const programme = VENUE_PROGRAMME_LABELS[cinema.kind];
  const distance = formatDistance(cinema.distanceKm);
  const press = usePressScale();
  const favorites = useFavoriteCinemas();
  const saved = favorites.isSaved(cinema.id);

  const place = {
    latitude: cinema.latitude,
    longitude: cinema.longitude,
    label: cinema.name,
  };

  /**
   * "4 screens · 7 films on", with each half held together.
   *
   * A ground has stands and fixtures, not screens and films, which is why the
   * nouns come from the venue kind: this read "1 screen · 1 films on" for
   * Wankhede, three wrong words out of six.
   *
   * The spaces inside each half are non-breaking, so the line breaks at the
   * separator or not at all. Three icon buttons share this row and leave the
   * text about a hundred points on a narrow phone, which is not enough - and
   * the break was landing between "films" and "on", stranding a word on a
   * line of its own.
   */
  // Stable per chain, so the same brand is the same colour on every card.
  const tint = brandTint(cinema.brand);
  const mark = brandInitials(cinema.brand);

  const summary =
    `${cinema.screenCount}\u00a0${spaces[cinema.screenCount === 1 ? 'one' : 'many']}` +
    (cinema.nowShowingCount > 0
      ? ` \u00b7 ${cinema.nowShowingCount}\u00a0${programme[cinema.nowShowingCount === 1 ? 'one' : 'many']}\u00a0on`
      : ' \u00b7 nothing\u00a0on');

  return (
    // The footer's IconActions are siblings of the card's Pressable, not
    // descendants of it: on web a Pressable with accessibilityRole="button"
    // renders as a real <button>, and a <button> nested inside another
    // <button> is invalid HTML — the comment below about these "not being
    // wrapped in the card's own press target" used to be true only in intent,
    // since they were still mounted inside it.
    <View
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
      ]}
    >
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
        style={[{ gap: spacing.md }, press.style]}
      >
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
          {/* The chain, as a mark. This tab was eighteen cards of grey text
              and the only screen in the app with no artwork at all; a stock
              photograph of somebody else's foyer standing in for this venue
              would have been colour bought with a small lie. The name is
              true, and it gives the list a rhythm to scan down. */}
          <View
            accessible={false}
            style={{
              width: 48,
              height: 48,
              borderRadius: radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors[`${tint}Muted`],
            }}
          >
            {/* Two sizes, both still "large text" to WCAG - 24px, or bold
                at 18.66px and over - which is the bar two of these four
                tints only clear in dark mode because the mark is big. A
                single letter gets the full 24; an acronym is set at 19 so it
                fits, because `title` ellipsised AMB to "A…" and the whole
                point of keeping an acronym was keeping it whole. */}
            <Text
              variant="title"
              style={{
                color: colors[tint],
                ...(mark.length > 1 ? { fontSize: 19, lineHeight: 23 } : null),
              }}
              numberOfLines={1}
            >
              {mark}
            </Text>
          </View>

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
      </AnimatedPressable>

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
          {summary}
        </Text>

        {/* Siblings of the card's Pressable, not children: these go somewhere
            else entirely, and a tap that opens Google Maps when the user
            meant to open the cinema is a bad surprise. */}
        <IconAction
          icon={saved ? 'heart' : 'heart-outline'}
          label={saved ? `Remove ${cinema.name} from saved` : `Save ${cinema.name}`}
          tint={saved ? colors.primary : colors.accent}
          onPress={() => favorites.toggle(cinema)}
        />
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
    </View>
  );
}

function IconAction({
  icon,
  label,
  tint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** Defaults to the accent — the heart overrides it once saved, so it reads
   * the same red as every other "this is saved" state in the app. */
  tint?: string;
  onPress: () => void;
}) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
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
      <Ionicons name={icon} size={18} color={tint ?? colors.accent} />
    </Pressable>
  );
}
