import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, View, type ViewToken } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AppBar, Text } from '../components/ui';
import { SponsorCard } from '../features/sponsors/sponsor-card';
import { SPONSORS, type Sponsor } from '../features/sponsors/sponsors';
import { useTheme } from '../theme';

/**
 * The house ads, all of them, on a screen somebody chose to open.
 *
 * Exactly one film plays at a time — the one most on screen. Four decoders
 * running at once for a list this short is a measurable amount of battery for
 * three things nobody is looking at, and on a mid-range phone it is also a
 * stutter in the scroll.
 */
export default function SponsorsScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const [activeId, setActiveId] = useState<string | null>(SPONSORS[0]?.id ?? null);

  // Both of these have to keep the same identity for the life of the screen:
  // FlatList treats them as immutable after the first render and warns loudly
  // if they change.
  //
  // Lazy initial state rather than `useRef(...).current`, which reads a ref
  // during render — something React asks you not to do, because under
  // concurrent rendering a render can be thrown away and replayed. `useMemo`
  // would be the other obvious reach and is the wrong one here: React is
  // explicitly allowed to discard a memo and recompute it, which is exactly
  // the identity change FlatList complains about. The initialiser of
  // `useState` runs once and never again, which is the guarantee this needs.
  const [viewabilityConfig] = useState(() => ({ itemVisiblePercentThreshold: 60 }));

  const [onViewableItemsChanged] = useState(
    () =>
      ({ viewableItems }: { viewableItems: ViewToken[] }) => {
        // The first fully-enough visible item wins, so scrolling hands play
        // from one card to the next rather than leaving a gap with nothing
        // running.
        const first = viewableItems[0]?.item as Sponsor | undefined;
        if (first) setActiveId(first.id);
      },
  );

  const header = useCallback(
    () => (
      <Animated.View entering={FadeInDown.duration(260)} style={{ gap: spacing.sm }}>
        <Text variant="heading">Nobody paid for these</Text>
        <Text variant="caption" tone="muted">
          A ticketing app has ad slots — beside a film, after a booking. This one fills them with
          the projects its own author built, and says so on every card, because an app that argues
          for honest software should not open with a lie about its revenue.
        </Text>
      </Animated.View>
    ),
    [spacing.sm],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppBar
        title="House ads"
        subtitle="Built by this app's author"
        onBack={() => router.back()}
      />

      <FlatList
        data={SPONSORS}
        keyExtractor={(sponsor) => sponsor.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(60 + index * 60).duration(260)}>
            <SponsorCard sponsor={item} active={item.id === activeId} />
          </Animated.View>
        )}
      />
    </View>
  );
}
