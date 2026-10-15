import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { Redirect, Tabs } from 'expo-router';
import { useEffect } from 'react';
import type { ColorValue } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { bookingApi } from '../../api/booking';
import { useAuth } from '../../features/auth/auth-provider';
import { queryKeys } from '../../lib/query-client';
import { useTheme } from '../../theme';

const AnimatedIonicons = Animated.createAnimatedComponent(Ionicons);

/** A small settle on arrival, not a bounce on every render — keyed to the one
 * moment that actually changed, which tab is focused. */
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
  const scale = useSharedValue(focused ? 1 : 0.88);

  useEffect(() => {
    scale.value = withSpring(focused ? 1 : 0.88, { damping: 14, stiffness: 220 });
  }, [focused, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return <AnimatedIonicons name={name} color={color as string} size={size} style={style} />;
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

  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? 'home' : 'home-outline'} color={color} size={size} focused={focused} />
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
          tabBarBadgeStyle: { backgroundColor: colors.primary },
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
  );
}
