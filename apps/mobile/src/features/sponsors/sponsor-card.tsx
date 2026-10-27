import Ionicons from '@expo/vector-icons/Ionicons';
import { Linking, Pressable, View } from 'react-native';
import { Text } from '../../components/ui';
import { useTheme } from '../../theme';
import { SponsorFilm } from './sponsor-film';
import type { Sponsor } from './sponsors';

/**
 * A sponsor slot: the film, then who it is for and what it is.
 *
 * The badge is the first thing in the card and says "House ad", because the
 * slot looks exactly like a paid placement and is not one. Calling it
 * "Sponsored" would be the lie; calling it nothing would be a quieter version
 * of the same lie.
 *
 * `compact` is the in-feed form — film, name, one line — for a slot sitting
 * between two rails on the home screen. The full form carries the blurb and
 * the link, and belongs on a screen somebody chose to open.
 */
export function SponsorCard({
  sponsor,
  active = true,
  compact = false,
  onPress,
}: {
  sponsor: Sponsor;
  active?: boolean;
  compact?: boolean;
  onPress?: () => void;
}) {
  const { colors, radius, spacing } = useTheme();

  const open = () => {
    if (onPress) {
      onPress();
      return;
    }
    if (sponsor.url) void Linking.openURL(sponsor.url);
  };

  const tappable = Boolean(onPress ?? sponsor.url);

  return (
    <Pressable
      accessibilityRole={tappable ? 'button' : undefined}
      accessibilityLabel={
        `House ad. ${sponsor.name}. ${sponsor.kicker}.` +
        (tappable ? ` Opens ${sponsor.url ? sponsor.url : 'more about it'}.` : '')
      }
      disabled={!tappable}
      onPress={open}
      style={({ pressed }) => ({
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed && tappable ? colors.surfaceMuted : colors.surface,
        overflow: 'hidden',
      })}
    >
      <SponsorFilm sponsor={sponsor} active={active} />

      <View style={{ padding: spacing.md, gap: compact ? 4 : spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          {/* The brand's own colour, as a dot rather than as a background:
              four slots each repainting the card would fight the app. */}
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: sponsor.accent,
            }}
          />
          <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>
            {sponsor.name}
          </Text>
          <Text variant="caption" tone="muted" style={{ letterSpacing: 0.4 }}>
            HOUSE AD
          </Text>
        </View>

        <Text variant="caption" tone="muted" numberOfLines={compact ? 2 : undefined}>
          {compact ? sponsor.kicker : sponsor.blurb}
        </Text>

        {!compact ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Text variant="caption" style={{ color: sponsor.accent, fontWeight: '700' }}>
              {sponsor.note}
            </Text>
            {sponsor.url ? <Ionicons name="open-outline" size={13} color={sponsor.accent} /> : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
