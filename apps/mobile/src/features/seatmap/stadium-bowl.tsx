import type { SeatMap } from '@app/shared';
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Ellipse, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Text } from '../../components/ui';
import { useTheme } from '../../theme';

/**
 * The ground seen from above, with every stand drawn on the side it is
 * actually on — the plan a ground posts at its own gates.
 *
 * This is the version the facing graphic could not be. A stand is a price
 * band with a bearing now, so "B. C. Roy Club House" can be drawn at the
 * Club House end instead of being a heading in a list that could have been
 * anywhere. Tapping a stand jumps the seat list to it, which is the question
 * somebody actually arrives with: not "which row" but "which side".
 *
 * Falls back to nothing when the bands carry no bearing. A cinema has one
 * screen and no sides; an arena's blocks stack back from a stage rather than
 * ringing a pitch. Drawing a ring for either would be inventing a shape the
 * building does not have.
 */

type Tier = SeatMap['tiers'][number];

/** Degrees → a point on an ellipse, with 0° at the top and rising clockwise. */
function pointOn(cx: number, cy: number, rx: number, ry: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + rx * Math.cos(rad), y: cy + ry * Math.sin(rad) };
}

/**
 * An annular sector: the ring segment one stand occupies. Drawn as two arcs
 * and two straight edges, which is what gives the bowl its banked look rather
 * than reading as a pie chart.
 */
function sectorPath(
  cx: number,
  cy: number,
  inner: { rx: number; ry: number },
  outer: { rx: number; ry: number },
  from: number,
  to: number,
) {
  const large = to - from > 180 ? 1 : 0;
  const o1 = pointOn(cx, cy, outer.rx, outer.ry, from);
  const o2 = pointOn(cx, cy, outer.rx, outer.ry, to);
  const i2 = pointOn(cx, cy, inner.rx, inner.ry, to);
  const i1 = pointOn(cx, cy, inner.rx, inner.ry, from);
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${outer.rx} ${outer.ry} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L ${i2.x} ${i2.y}`,
    `A ${inner.rx} ${inner.ry} 0 ${large} 0 ${i1.x} ${i1.y}`,
    'Z',
  ].join(' ');
}

export function StadiumBowl({
  tiers,
  activeTier,
  onSelectStand,
}: {
  tiers: Tier[];
  /** The band the seat list is currently showing, drawn lit. */
  activeTier?: Tier['tier'];
  onSelectStand?: (tier: Tier['tier']) => void;
}) {
  const { colors, spacing } = useTheme();

  const stands = useMemo(
    () => tiers.filter((t): t is Tier & { bearing: number } => typeof t.bearing === 'number'),
    [tiers],
  );

  if (stands.length < 2) return null;

  const W = 300;
  const H = 200;
  const cx = W / 2;
  const cy = H / 2;
  // The outfield, then the ring of stands outside it. Foreshortened, because
  // a ground is wider than it is deep from anywhere a person sits.
  const field = { rx: 68, ry: 48 };
  const inner = { rx: 76, ry: 56 };
  const outer = { rx: 140, ry: 94 };

  // Each stand owns an equal share of the ring, centred on its bearing, with a
  // gap so the concourses between stands read as gaps rather than as seams.
  const share = 360 / stands.length;
  const gap = Math.min(8, share * 0.12);

  return (
    <View style={{ alignItems: 'center', gap: spacing.sm }}>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {stands.map((stand) => {
          const from = stand.bearing - share / 2 + gap / 2;
          const to = stand.bearing + share / 2 - gap / 2;
          const active = stand.tier === activeTier;
          const mid = pointOn(cx, cy, (inner.rx + outer.rx) / 2, (inner.ry + outer.ry) / 2, stand.bearing);
          return (
            <G key={stand.tier}>
              <Path
                d={sectorPath(cx, cy, inner, outer, from, to)}
                fill={active ? colors.primary : colors.surfaceMuted}
                fillOpacity={active ? 0.9 : 1}
                stroke={active ? colors.primary : colors.border}
                strokeWidth={1}
                onPress={onSelectStand ? () => onSelectStand(stand.tier) : undefined}
              />
              {/* The short name only. A full stand name does not fit in an arc
                  this size, and the list below it carries the long form. */}
              <SvgText
                x={mid.x}
                y={mid.y + 3}
                fontSize={9}
                fontWeight="700"
                fill={active ? colors.onPrimary : colors.textMuted}
                textAnchor="middle"
              >
                {shortName(stand.label)}
              </SvgText>
            </G>
          );
        })}

        {/* The outfield and the square, the same two shapes the facing
            graphic uses, so the bowl and the header read as one drawing. */}
        <Ellipse
          cx={cx}
          cy={cy}
          rx={field.rx}
          ry={field.ry}
          fill={colors.success}
          fillOpacity={0.14}
          stroke={colors.success}
          strokeOpacity={0.45}
          strokeWidth={1}
        />
        <Ellipse
          cx={cx}
          cy={cy}
          rx={field.rx / 2}
          ry={field.ry / 2}
          stroke={colors.success}
          strokeOpacity={0.25}
          strokeWidth={1}
          fill="none"
        />
        <Rect
          x={cx - 5}
          y={cy - 17}
          width={9}
          height={34}
          rx={1}
          fill={colors.warning}
          fillOpacity={0.3}
          stroke={colors.warning}
          strokeOpacity={0.6}
          strokeWidth={1}
        />
      </Svg>

      <Text variant="overline" tone="muted">
        TAP A STAND
      </Text>
    </View>
  );
}

/**
 * What fits in an arc.
 *
 * "B. C. Roy Club House" becomes "CLUB HOUSE" and "Sachin Tendulkar Stand"
 * becomes "TENDULKAR" — the words somebody says out loud when telling a
 * friend where they are sitting.
 *
 * Stripping the generic noun is only worth it while something distinctive is
 * left. "Block B" stripped down to "B", which is not a name, it is an
 * initial: at a ground with Blocks B, H and L the map would have spelled out
 * three lonely letters. So the strip is kept only when it leaves a real word.
 */
function shortName(label: string): string {
  const stripped = label
    .replace(/\b(stand|block|terrace|pavilion|tier|lounge|box)\b/gi, '')
    .replace(/[.]/g, '')
    .trim();
  const words = stripped.split(/\s+/).filter(Boolean);
  const distinctive = words[words.length - 1];

  // Nothing worth keeping once the noun is gone — "Block B", "I Stand". Use
  // the label itself, which is already short in exactly these cases.
  if (!distinctive || distinctive.length < 3) return label.toUpperCase().slice(0, 11);

  // Two short words read better together than one alone: "CLUB HOUSE", not
  // "HOUSE".
  const pair = words.slice(-2).join(' ');
  return (pair.length <= 11 && words.length > 1 ? pair : distinctive).toUpperCase().slice(0, 11);
}
