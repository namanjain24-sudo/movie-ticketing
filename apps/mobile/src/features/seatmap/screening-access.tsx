import Ionicons from '@expo/vector-icons/Ionicons';
import type { AccessibilityFeature } from '@app/shared';
import { View } from 'react-native';
import { Text } from '../../components/ui';
import { accessibilityNote } from '../catalog/accessibility-note';
import { useTheme } from '../../theme';

/**
 * What this screening offers somebody who cannot see or hear all of it, said
 * on the page where the booking is actually made.
 *
 * It was on the showtime chip in the listing and nowhere after it, so the
 * disclosure vanished at the moment it started to matter — and the Ministry's
 * July 2026 advisory is about the booking page, not the browse page. A chip
 * two screens back is also no use to the person deciding whether to spend
 * nine hundred rupees on a film they may not be able to follow.
 *
 * Sits above the wheelchair-space row rather than below it, because this one
 * has something to do before arriving: the app has to be installed and
 * headphones found, and neither can be sorted out in the foyer.
 *
 * Renders nothing when nothing is claimed. An empty list is not a statement
 * that the screening has none, and printing one would be the only dishonest
 * thing on the screen.
 */
export function ScreeningAccess({
  features,
  via,
}: {
  features: AccessibilityFeature[];
  via: string | null;
}) {
  const { colors, radius, spacing } = useTheme();

  const note = accessibilityNote(features, via);
  if (!note) return null;

  return (
    <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
      <View
        // One node, not three. Swiping through "ear icon", then a heading,
        // then a sentence makes somebody assemble the announcement from
        // pieces; this is a single thing to be told.
        accessible
        accessibilityRole="summary"
        accessibilityLabel={
          note.delivery ? `${note.offered}. ${note.delivery}` : `This screening has ${note.offered}`
        }
        style={{
          flexDirection: 'row',
          gap: spacing.sm,
          alignItems: 'flex-start',
          padding: spacing.md,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <Ionicons name="ear-outline" size={16} color={colors.text} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label">{note.offered}</Text>
          {note.delivery ? (
            <Text variant="caption" tone="muted">
              {note.delivery}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}
