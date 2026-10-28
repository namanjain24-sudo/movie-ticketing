import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Dimensions,
  Pressable,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  interpolate,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import { Button, Text } from '../components/ui';
import { useOnboarding } from '../features/onboarding/onboarding-provider';
import { HoldMotif, TicketMotif, TierMotif } from '../features/onboarding/motifs';
import { tapFeedback } from '../lib/haptics';
import { useTheme } from '../theme';

const { width: SCREEN } = Dimensions.get('window');

type Panel = {
  key: string;
  eyebrow: string;
  title: string;
  body: string;
  Motif: (props: { active: boolean }) => React.ReactElement;
};

const PANELS: Panel[] = [
  {
    key: 'hold',
    eyebrow: 'NO OVERSELLING, EVER',
    title: 'Your seat is yours\nfor five minutes',
    body: 'The instant you pick a seat it is held, not just shown as taken. Pay at your pace — nobody else can grab it out from under you.',
    Motif: HoldMotif,
  },
  {
    key: 'tier',
    eyebrow: 'THE PRICE IS ON THE MAP',
    title: 'See every price\nbefore you commit',
    body: 'Standard, Premium or Recliner — the section tells you the price up front. No surprise jump at checkout.',
    Motif: TierMotif,
  },
  {
    key: 'ticket',
    eyebrow: 'WORKS WITHOUT SIGNAL',
    title: 'A ticket that needs\nno connection',
    body: 'Your QR is cryptographically signed the moment you pay, so the gate can verify it even if the venue’s wifi is down.',
    Motif: TicketMotif,
  },
];

/**
 * The three-screen intro shown once, before sign-in — a landing page that
 * lives inside the app instead of a separate site, so the very first thing a
 * new install shows is the product's own voice rather than a bare auth form.
 * See `AuthScaffold` for the same reasoning applied to the sign-in screen it
 * hands off to.
 */
export default function Onboarding() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const onboarding = useOnboarding();

  const [index, setIndex] = useState(0);
  const scrollX = useSharedValue(0);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  const finish = useCallback(() => {
    onboarding.complete();
    // Into the app, not into a form. The intro's last word is about going to
    // the cinema; following it with a password was the app asking to be paid
    // in effort before showing anybody anything.
    router.replace('/(tabs)');
  }, [onboarding, router]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
    },
  });

  const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN));
  }, []);

  const isLast = index === PANELS.length - 1;

  const goNext = () => {
    tapFeedback();
    if (isLast) {
      finish();
      return;
    }
    const next = index + 1;
    scrollTo(scrollRef, next * SCREEN, 0, true);
    setIndex(next);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.chrome }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Skip the introduction"
        onPress={finish}
        hitSlop={8}
        style={{
          position: 'absolute',
          top: insets.top + spacing.sm,
          right: spacing.lg,
          zIndex: 1,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        }}
      >
        <Text variant="label" style={{ color: colors.onChromeMuted }}>
          Skip
        </Text>
      </Pressable>

      <Animated.ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        onMomentumScrollEnd={onMomentumEnd}
        scrollEventThrottle={16}
        bounces={false}
        // Without this the row is only as tall as its tallest panel, and a
        // panel has no height to centre anything in — which is how the intro
        // ended up with its copy pinned to the top and a third of the screen
        // empty between that and the button.
        contentContainerStyle={{ flexGrow: 1 }}
      >
        {PANELS.map((panel, i) => (
          <OnboardingPanel
            key={panel.key}
            panel={panel}
            index={i}
            scrollX={scrollX}
            active={index === i}
          />
        ))}
      </Animated.ScrollView>

      <View
        style={{
          paddingHorizontal: spacing.xl,
          paddingBottom: insets.bottom + spacing.lg,
          paddingTop: spacing.lg,
          gap: spacing.xl,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.xs }}>
          {PANELS.map((panel, i) => (
            <View
              key={panel.key}
              style={{
                width: i === index ? 20 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === index ? colors.primary : colors.onChromeMuted,
              }}
            />
          ))}
        </View>

        <Button label={isLast ? 'Get started' : 'Next'} onPress={goNext} />
      </View>
    </View>
  );
}

function OnboardingPanel({
  panel,
  index,
  scrollX,
  active,
}: {
  panel: Panel;
  index: number;
  scrollX: SharedValue<number>;
  active: boolean;
}) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const { Motif } = panel;

  const style = useAnimatedStyle(() => {
    const distance = scrollX.value / SCREEN - index;
    return {
      opacity: interpolate(distance, [-1, 0, 1], [0, 1, 0], Extrapolation.CLAMP),
      transform: [
        { scale: interpolate(distance, [-1, 0, 1], [0.92, 1, 0.92], Extrapolation.CLAMP) },
        { translateY: interpolate(distance, [-1, 0, 1], [16, 0, 16], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <View
      style={{
        width: SCREEN,
        // The parent lays its children out in a column, so `flex` grows this
        // vertically and `width` keeps the horizontal size it is paged by.
        flex: 1,
        justifyContent: 'center',
        paddingTop: insets.top + spacing.xl,
        paddingBottom: spacing.xl,
      }}
    >
      <Animated.View style={[{ alignItems: 'center', gap: spacing['2xl'] }, style]}>
        <View style={{ height: 150, alignItems: 'center', justifyContent: 'center' }}>
          <Motif active={active} />
        </View>

        <View style={{ gap: spacing.md, paddingHorizontal: spacing['2xl'], alignItems: 'center' }}>
          <Text variant="overline" style={{ color: colors.accent, letterSpacing: 2 }}>
            {panel.eyebrow}
          </Text>
          <Text variant="display" tone="onChrome" align="center">
            {panel.title}
          </Text>
          <Text align="center" style={{ color: colors.onChromeMuted, maxWidth: 320 }}>
            {panel.body}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}
