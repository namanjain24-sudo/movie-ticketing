import type { Booking } from '@app/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { bookingApi } from '../../api/booking';
import { EmptyState, ErrorState } from '../../components/query-state';
import { AppBar, Skeleton, Text } from '../../components/ui';
import { BookingCard } from '../../features/bookings/booking-card';
import { tapFeedback } from '../../lib/haptics';
import { queryKeys } from '../../lib/query-client';
import { useTheme } from '../../theme';

type Tab = 'upcoming' | 'past';

export default function Bookings() {
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();
  const [tab, setTab] = useState<Tab>('upcoming');

  const bookings = useQuery({
    queryKey: queryKeys.bookings,
    queryFn: bookingApi.bookings,
    // Coming back from a confirmed payment should not show a stale list.
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const list: Booking[] =
    (tab === 'upcoming' ? bookings.data?.upcoming : bookings.data?.past) ?? [];

  const header = (
    <View style={{ flexDirection: 'row', gap: spacing.sm, padding: spacing.lg }}>
      {(['upcoming', 'past'] as const).map((value) => {
        const selected = value === tab;
        const count =
          value === 'upcoming' ? bookings.data?.upcoming.length : bookings.data?.past.length;
        return (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (value !== tab) tapFeedback();
              setTab(value);
            }}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: spacing.sm + 2,
              borderRadius: radius.md,
              backgroundColor: selected ? colors.primary : colors.surface,
              borderWidth: 1,
              borderColor: selected ? colors.primary : colors.border,
            }}
          >
            <Text variant="label" style={{ color: selected ? colors.onPrimary : colors.text }}>
              {value === 'upcoming' ? 'Upcoming' : 'Past'}
              {count === undefined ? '' : ` (${count})`}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppBar title="My bookings" subtitle="Tickets" />

      {bookings.isPending ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Skeleton style={{ height: 44, borderRadius: 10 }} />
          <Skeleton style={{ height: 116, borderRadius: 14 }} />
          <Skeleton style={{ height: 116, borderRadius: 14 }} />
        </View>
      ) : bookings.isError ? (
        <ErrorState
          error={bookings.error}
          title="Could not load your bookings"
          onRetry={() => void bookings.refetch()}
        />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(booking) => booking.id}
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <BookingCard booking={item} onPress={() => router.push(`/booking/${item.reference}`)} />
          )}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing['2xl'],
            gap: spacing.md,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={bookings.isRefetching}
              onRefresh={() => void bookings.refetch()}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={{ paddingTop: spacing.xl }}>
              <EmptyState
                icon="ticket-outline"
                title={tab === 'upcoming' ? 'No upcoming tickets' : 'Nothing in your history yet'}
                message={
                  tab === 'upcoming'
                    ? 'Book a film and your ticket will wait for you here.'
                    : 'Films you have already seen will appear here.'
                }
                action={
                  tab === 'upcoming'
                    ? { label: 'Browse films', onPress: () => router.push('/(tabs)') }
                    : undefined
                }
              />
            </View>
          }
        />
      )}
    </View>
  );
}
