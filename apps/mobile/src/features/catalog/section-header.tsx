import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from '../../components/ui';
import { useTheme } from '../../theme';
import { markerPath, seedFrom } from '../../theme/marker';

/** How tall the stroke is drawn, and how much room is kept under the words. */
const STROKE_HEIGHT = 14;

/**
 * A section heading with a marker stroke under it.
 *
 * This was a three-point violet rule to the left of the title. It did the job
 * and said nothing: every list in every app has one. The stroke says the same
 * thing - a section starts here - in the register the rest of this app is
 * written in, and it costs one SVG path.
 *
 * Drawn under the words rather than through them. A highlighter over text is
 * a readability problem dressed as a style, and these headings are the only
 * way anybody finds anything on this screen.
 *
 * The stroke is measured from the title, so it is the length of the words
 * rather than the width of the column, and seeded from them, so a given
 * section is marked the same way every time while two sections differ.
 */
export function SectionHeader({ title, note }: { title: string; note?: string }) {
  const { colors, spacing } = useTheme();

  // Measured, because the stroke belongs to the words. Zero until the first
  // layout, which `markerPath` answers with an empty path rather than a
  // malformed one.
  const [textWidth, setTextWidth] = useState(0);

  return (
    <View style={{ paddingHorizontal: spacing.lg, gap: spacing.xs }}>
      <View style={{ alignSelf: 'flex-start', paddingBottom: STROKE_HEIGHT - 4 }}>
        <Text variant="title" onLayout={(e) => setTextWidth(e.nativeEvent.layout.width)}>
          {title}
        </Text>
        {/* Absolute, so the stroke cannot widen the box it is measured from.
            Laid out normally it did: the box grew to fit the overshoot, the
            text grew with the box, the next measurement was wider again, and
            the mark settled at the full width of the column - a rule, which
            is the one thing it was drawn not to be. */}
        <Svg
          width={textWidth + STROKE_HEIGHT}
          height={STROKE_HEIGHT}
          style={{ position: 'absolute', left: 0, bottom: 0 }}
          pointerEvents="none"
        >
          <Path d={markerPath(textWidth, STROKE_HEIGHT, seedFrom(title))} fill={colors.accent} />
        </Svg>
      </View>
      {note ? (
        <Text variant="caption" tone="muted">
          {note}
        </Text>
      ) : null}
    </View>
  );
}
