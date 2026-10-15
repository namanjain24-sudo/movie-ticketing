import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '../../components/ui';
import { useTheme } from '../../theme';
import { gradients } from '../../theme/tokens';

/**
 * Three motifs, one per onboarding panel, each drawn from the same geometry
 * the product itself uses elsewhere (the seat shape, the tier pill, the
 * signed-QR ticket) rather than borrowed from an icon set — the same rule
 * `AuthScaffold`'s `SeatMotif` follows.
 *
 * Each plays exactly one authored move when its panel becomes active, not a
 * loop: DESIGN.md's "one authored moment" rule, applied per panel instead of
 * per screen, since an onboarding carousel is the one place in this app
 * where motion is pure delight and not fighting a countdown.
 */

/** Panel 1: a seat row where one seat fills in and a ring sweeps around it — the five-minute hold, drawn rather than explained. */
export function HoldMotif({ active }: { active: boolean }) {
  const { colors, radius } = useTheme();
  const sweep = useSharedValue(0);
  const fill = useSharedValue(0);

  useEffect(() => {
    if (!active) return;
    fill.value = 0;
    sweep.value = 0;
    fill.value = withDelay(150, withSpring(1, { damping: 12, stiffness: 160 }));
    sweep.value = withDelay(150, withTiming(1, { duration: 1400 }));
  }, [active, fill, sweep]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: sweep.value > 0 && sweep.value < 1 ? 1 : 0,
    transform: [{ rotate: `${sweep.value * 360}deg` }],
  }));
  const fillStyle = useAnimatedStyle(() => ({
    opacity: fill.value,
    transform: [{ scale: 0.6 + fill.value * 0.4 }],
  }));

  const seats = [0, 1, 2, 3, 4];
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
      {seats.map((i) => {
        const held = i === 2;
        return (
          <View
            key={i}
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
          >
            {held ? (
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    borderWidth: 2,
                    borderColor: colors.accent,
                    borderRightColor: 'transparent',
                    borderBottomColor: 'transparent',
                  },
                  ringStyle,
                ]}
              />
            ) : null}
            <View
              style={{
                width: 30,
                height: 30,
                borderTopLeftRadius: radius.sm,
                borderTopRightRadius: radius.sm,
                borderBottomLeftRadius: 4,
                borderBottomRightRadius: 4,
                borderWidth: 1.5,
                borderColor: held ? colors.accent : colors.onChromeMuted,
                backgroundColor: 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {held ? (
                <Animated.View
                  style={[
                    { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
                    { backgroundColor: colors.accent },
                    fillStyle,
                  ]}
                />
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const TIERS: { label: string; price: string; grad: readonly [string, string] }[] = [
  { label: 'Standard', price: '₹220', grad: ['#4B4B5C', '#2B2B38'] },
  { label: 'Premium', price: '₹350', grad: gradients.accent },
  { label: 'Recliner', price: '₹650', grad: gradients.primary },
];

/** Panel 2: the seat map's own tier pills, rising into place with the price already on them. */
export function TierMotif({ active }: { active: boolean }) {
  const { spacing } = useTheme();

  return (
    <View style={{ gap: spacing.sm, width: 220 }}>
      {TIERS.map((tier, i) => (
        <TierBar key={tier.label} tier={tier} index={i} active={active} />
      ))}
    </View>
  );
}

function TierBar({
  tier,
  index,
  active,
}: {
  tier: { label: string; price: string; grad: readonly [string, string] };
  index: number;
  active: boolean;
}) {
  const { colors, radius, spacing } = useTheme();
  const rise = useSharedValue(0);

  useEffect(() => {
    if (!active) return;
    rise.value = 0;
    rise.value = withDelay(index * 110, withSpring(1, { damping: 14, stiffness: 180 }));
  }, [active, index, rise]);

  const style = useAnimatedStyle(() => ({
    opacity: rise.value,
    transform: [{ translateY: (1 - rise.value) * 14 }],
  }));

  return (
    // The rise/fade animates a plain Animated.View, not the LinearGradient
    // directly: Reanimated's createAnimatedComponent around a third-party
    // host component (unlike its own Pressable/View) does not reliably patch
    // style updates through on web, so an animated LinearGradient here sat
    // permanently at its opacity-0 starting style instead of rising in.
    <Animated.View style={style}>
      <LinearGradient
        colors={tier.grad}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radius.full,
        }}
      >
        <Text variant="label" style={{ color: colors.onImage }}>
          {tier.label}
        </Text>
        <Text variant="label" numeric style={{ color: colors.onImage }}>
          {tier.price}
        </Text>
      </LinearGradient>
    </Animated.View>
  );
}

/** Panel 3: a ticket stub with a signed badge popping in — verifiable without a signal, not just "here is a QR code". */
export function TicketMotif({ active }: { active: boolean }) {
  const { colors, radius, spacing } = useTheme();
  const pop = useSharedValue(0);

  useEffect(() => {
    if (!active) return;
    pop.value = 0;
    pop.value = withDelay(500, withSpring(1, { damping: 10, stiffness: 220 }));
  }, [active, pop]);

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ scale: pop.value }],
  }));

  const dots = Array.from({ length: 36 });
  const filled = new Set([1, 2, 5, 7, 9, 11, 14, 16, 19, 22, 24, 27, 30, 33]);

  return (
    <View
      style={{
        width: 170,
        borderRadius: radius.lg,
        backgroundColor: colors.chromeSurface,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        padding: spacing.lg,
        alignItems: 'center',
        gap: spacing.md,
      }}
    >
      <View
        style={{
          width: 96,
          height: 96,
          borderRadius: radius.md,
          backgroundColor: 'rgba(255,255,255,0.92)',
          flexDirection: 'row',
          flexWrap: 'wrap',
          padding: 10,
          alignContent: 'flex-start',
        }}
      >
        {dots.map((_, i) => (
          <View
            key={i}
            style={{
              width: 10,
              height: 10,
              margin: 1.5,
              borderRadius: 1,
              // A handful of pseudo-random-looking filled cells reads as "a
              // code" without claiming to be a real, scannable one.
              backgroundColor: filled.has(i) ? colors.onImageSurface : 'transparent',
            }}
          />
        ))}
      </View>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: -10,
            right: -10,
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: colors.success,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: colors.chrome,
          },
          badgeStyle,
        ]}
      >
        <Text variant="label" style={{ color: colors.onImage }}>
          ✓
        </Text>
      </Animated.View>
    </View>
  );
}
