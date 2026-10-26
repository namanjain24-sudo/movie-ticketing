import type { EventKind } from '@app/shared';
import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';
import Svg, { Ellipse, Line, Rect } from 'react-native-svg';
import { Text } from '../../components/ui';
import { useTheme } from '../../theme';
import { gradients } from '../../theme/tokens';

/**
 * What the seats are pointing at, drawn in the venue's own shape.
 *
 * The label has said "PITCH THIS WAY" at a ground for a while, but the
 * drawing under it was still a cinema screen: the same curve, the same
 * projector wash thrown down it. A curved screen above a cricket ground is
 * the map telling somebody it does not know where it is, and the label made
 * that louder rather than quieter — it named a thing the picture contradicted.
 *
 * So the picture changes with the venue. A ground is an oval with a pitch
 * across the middle of it, which is the one shape nobody needs a caption for.
 * A stage is a stage. A cinema keeps its screen, because that drawing was
 * never wrong.
 *
 * What this deliberately does not do is say which stand you are in. That
 * would be the useful version — a bowl with your block lit up — and the data
 * does not exist: a tier is a price band with a name on it, and nothing in
 * the seat map says where around the ground the B. C. Roy Club House sits.
 * Drawing a guess would be worse than drawing nothing, because a map that is
 * confidently wrong about where you are sitting is how somebody ends up at
 * the wrong gate.
 */

const FACING_LABEL: Record<EventKind | 'FILM', string> = {
  FILM: 'SCREEN THIS WAY',
  SPORT: 'PITCH THIS WAY',
  CONCERT: 'STAGE THIS WAY',
  COMEDY: 'STAGE THIS WAY',
  THEATRE: 'STAGE THIS WAY',
  WORKSHOP: 'FRONT OF ROOM',
};

type Facing = EventKind | 'FILM';

export function VenueFacing({ facing = 'FILM' }: { facing?: Facing }) {
  const { spacing } = useTheme();

  return (
    <View style={{ alignItems: 'center', paddingBottom: spacing.lg }}>
      {facing === 'SPORT' ? (
        <Ground />
      ) : facing === 'FILM' || facing === 'WORKSHOP' ? (
        <Screen />
      ) : (
        <Stage />
      )}
      <Text variant="overline" tone="muted" style={{ marginTop: spacing['2xs'] }}>
        {FACING_LABEL[facing]}
      </Text>
    </View>
  );
}

/**
 * The cinema's screen, unchanged: a curve with the projector's light thrown
 * down it onto the seats.
 */
function Screen() {
  const { colors } = useTheme();

  return (
    <View style={{ width: '72%', height: 44 }}>
      <LinearGradient
        colors={gradients.projector}
        style={{
          position: 'absolute',
          top: 0,
          left: '4%',
          right: '4%',
          height: 44,
          borderTopLeftRadius: 120,
          borderTopRightRadius: 120,
        }}
        pointerEvents="none"
      />
      <View
        style={{
          width: '100%',
          height: 26,
          borderTopWidth: 3,
          borderColor: colors.accent,
          borderTopLeftRadius: 120,
          borderTopRightRadius: 120,
        }}
      />
    </View>
  );
}

/**
 * A ground, seen from the stand you are sitting in: the boundary as an oval
 * and the pitch as a strip across the middle of it. Foreshortened — the oval
 * is wider than it is tall — because that is what a ground looks like from a
 * seat rather than from a drone, and it keeps the whole thing inside the 64
 * points the header is allowed before it starts eating the seat map.
 */
function Ground() {
  const { colors } = useTheme();
  const W = 240;
  const H = 64;

  return (
    <View style={{ width: W, height: H }}>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* The outfield. Low-opacity success green: the one green in the
            system, and the only colour here that has to read as grass. */}
        <Ellipse
          cx={W / 2}
          cy={H / 2}
          rx={W / 2 - 2}
          ry={H / 2 - 2}
          fill={colors.success}
          fillOpacity={0.14}
        />
        {/* The boundary rope. */}
        <Ellipse
          cx={W / 2}
          cy={H / 2}
          rx={W / 2 - 2}
          ry={H / 2 - 2}
          stroke={colors.success}
          strokeOpacity={0.55}
          strokeWidth={1.5}
          fill="none"
        />
        {/* The thirty-yard circle, which is the detail that makes the oval
            read as a cricket ground rather than as a running track. */}
        <Ellipse
          cx={W / 2}
          cy={H / 2}
          rx={W / 4}
          ry={H / 4}
          stroke={colors.success}
          strokeOpacity={0.3}
          strokeWidth={1}
          fill="none"
        />
        {/* The square, with the pitch on it. */}
        <Rect
          x={W / 2 - 9}
          y={H / 2 - 13}
          width={18}
          height={26}
          rx={1}
          fill={colors.warning}
          fillOpacity={0.22}
        />
        <Line
          x1={W / 2}
          y1={H / 2 - 11}
          x2={W / 2}
          y2={H / 2 + 11}
          stroke={colors.warning}
          strokeOpacity={0.75}
          strokeWidth={2}
        />
      </Svg>
    </View>
  );
}

/**
 * A stage: a flat front edge with the wings falling away behind it, and the
 * house lights washing forward over the seats. Straight, not curved — a
 * curved stage is a cinema screen with a different caption on it, which is
 * the thing this file exists to stop.
 */
function Stage() {
  const { colors } = useTheme();
  const W = 220;
  const H = 48;

  return (
    <View style={{ width: W, height: H }}>
      <LinearGradient
        colors={gradients.projector}
        style={{ position: 'absolute', top: 18, left: '8%', right: '8%', height: 30 }}
        pointerEvents="none"
      />
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* The deck, narrowing upstage. */}
        <Rect
          x={W * 0.14}
          y={4}
          width={W * 0.72}
          height={14}
          rx={2}
          fill={colors.accent}
          fillOpacity={0.18}
        />
        {/* The front edge, where the performer stands. The one bright line. */}
        <Line
          x1={W * 0.08}
          y1={18}
          x2={W * 0.92}
          y2={18}
          stroke={colors.accent}
          strokeWidth={3}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}
