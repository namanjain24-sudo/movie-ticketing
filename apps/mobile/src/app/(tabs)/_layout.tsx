import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { View, type ColorValue } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { bookingApi } from '../../api/booking';
import { HeldSeatsBanner } from '../../features/checkout/held-seats-banner';
import { useAuth } from '../../features/auth/auth-provider';
import { queryKeys } from '../../lib/query-client';
import { useTheme } from '../../theme';
import { darkColors, motion } from '../../theme/tokens';

/** A small settle on arrival, not a bounce on every render — keyed to the one
 * moment that actually changed, which tab is focused.
 *
 * The transform lives on a wrapping `Animated.View`, not on an animated
 * Ionicons. Wrapping the icon itself goes through `setNativeProps`, which
 * `@expo/vector-icons` forwards to its inner `Text` — a method react-native-web
 * 0.21 no longer has, so the tab bar throws on the web target. A View is also
 * the cheaper thing to transform on native. */
function TabIcon({
  name,
  color,
  size,
  focused,
}: {
  name: keyof typeof Ionicons.glyphMap;
  color: ColorValue;
  size: number;
  focused: boolean;
}) {
  const { radius } = useTheme();
  const scale = useSharedValue(focused ? 1 : 0.88);

  useEffect(() => {
    scale.value = withSpring(focused ? 1 : 0.88, motion.spring.settle);
  }, [focused, scale]);

  // Declared after the effect that writes `scale`, which is the order React
  // Compiler accepts for a shared value and the order the rest of the app
  // uses. Reversing the two is reported as a write during render.
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={[
        style,
        {
          width: 46,
          height: 26,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          // A ground under the focused tab, not only a tint on its glyph.
          // Tint alone asks somebody to compare two shades of a 24px icon to
          // work out where they are; a filled pill answers it at a glance,
          // and spends the brand on the one piece of chrome that is on every
          // screen.
          //
          // From the dark palette, like the bar it sits on. Read from the
          // theme it was the light tint on a dark bar, which is a pale
          // lavender lozenge in a row of white glyphs.
          backgroundColor: focused ? darkColors.primaryMuted : 'transparent',
        },
      ]}
    >
      <Ionicons name={name} color={color as string} size={size} />
    </Animated.View>
  );
}

export default function TabsLayout() {
  const { isSignedIn } = useAuth();
  const { colors } = useTheme();

  // Same query key the bookings screen uses, so the two share one cache
  // entry: opening the tab does not refetch what the badge already has, and
  // a booking made or cancelled elsewhere updates both together.
  const bookings = useQuery({
    queryKey: queryKeys.bookings,
    queryFn: bookingApi.bookings,
    enabled: isSignedIn,
  });
  const upcomingCount = bookings.data?.upcoming.length ?? 0;

  /**
   * No guard here any more.
   *
   * This was the only one in the app, and it covered the whole of it: the
   * catalogue, the cinemas, the events, every film page. The API asks for an
   * account to *take* a seat and for nothing else, so the password this stood
   * behind was buying nobody anything. Signing in is now asked for at the two
   * tabs that are somebody's own account and at the moment seats are held,
   * which is where it means something.
   */

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          // Chrome, like the bar at the top, and the same in both themes.
          //
          // It was `surface`, which is white in the light theme - a bright
          // strip under a screen that is now cinema-dark, reading as a seam
          // rather than a frame. The two bars bracket the content instead.
          tabBarActiveTintColor: darkColors.primary,
          tabBarInactiveTintColor: darkColors.textMuted,
          tabBarStyle: {
            backgroundColor: darkColors.chrome,
            borderTopColor: colors.border,
            // Padding only, never an explicit height: React Navigation sizes
            // this bar from the bottom safe area, and overriding the height
            // is how a tab bar ends up under a home indicator.
            paddingTop: 4,
          },
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size, focused }) => (
              <TabIcon
                name={focused ? 'home' : 'home-outline'}
                color={color}
                size={size}
                focused={focused}
              />
            ),
          }}
        />
        {/* Live events sit next to films, because they are the other half of
          what this app sells, not a sub-section of the cinema directory. */}
        <Tabs.Screen
          name="events"
          options={{
            title: 'Events',
            tabBarIcon: ({ color, size, focused }) => (
              <TabIcon
                name={focused ? 'musical-notes' : 'musical-notes-outline'}
                color={color}
                size={size}
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="cinemas"
          options={{
            title: 'Cinemas',
            tabBarIcon: ({ color, size, focused }) => (
              <TabIcon
                name={focused ? 'location' : 'location-outline'}
                color={color}
                size={size}
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="bookings"
          options={{
            title: 'Tickets',
            tabBarIcon: ({ color, size, focused }) => (
              <TabIcon
                name={focused ? 'ticket' : 'ticket-outline'}
                color={color}
                size={size}
                focused={focused}
              />
            ),
            tabBarBadge: upcomingCount > 0 ? upcomingCount : undefined,
            tabBarBadgeStyle: { backgroundColor: colors.primarySolid },
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size, focused }) => (
              <TabIcon
                name={focused ? 'person-circle' : 'person-circle-outline'}
                color={color}
                size={size}
                focused={focused}
              />
            ),
          }}
        />
      </Tabs>
      {/* Between the screen and the tab bar, not above the screen: every tab
          here owns its own AppBar against the status bar, and a strip pushed
          in over the top of those would be the one thing on the page not
          lining up with anything. Down here it reads as what it is — a thing
          still going on, underneath whatever is being looked at now. */}
      <HeldSeatsBanner />
    </View>
  );
}
