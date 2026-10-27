import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../../components/ui';
import { useTheme } from '../../theme';
import { SponsorCard } from './sponsor-card';
import { sponsorOfTheDay, type Sponsor } from './sponsors';

/**
 * One house ad, in a feed.
 *
 * Which one is decided by the date rather than at random: a slot that
 * reshuffles every time a query refetches is a slot that moves under
 * somebody's thumb, and two people looking at the same phone on the same day
 * should see the same thing.
 *
 * The film plays only while this screen is the one in front. `useFocusEffect`
 * rather than mount state, because a stack push leaves the screen mounted
 * underneath — without this, opening a film detail would leave a video
 * decoding behind it for as long as somebody stayed there.
 */
export function SponsorSlot({
  heading = 'While you are here',
  sponsor = sponsorOfTheDay(),
}: {
  heading?: string;
  sponsor?: Sponsor;
}) {
  const router = useRouter();
  const { spacing } = useTheme();
  const [focused, setFocused] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  return (
    <View style={{ gap: spacing.md, paddingHorizontal: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
        <Text variant="heading" style={{ flex: 1 }}>
          {heading}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="See all house ads"
          hitSlop={8}
          onPress={() => router.push('/sponsors')}
        >
          <Text variant="caption" tone="primary">
            See all
          </Text>
        </Pressable>
      </View>

      <SponsorCard
        sponsor={sponsor}
        active={focused}
        compact
        onPress={() => router.push('/sponsors')}
      />
    </View>
  );
}
