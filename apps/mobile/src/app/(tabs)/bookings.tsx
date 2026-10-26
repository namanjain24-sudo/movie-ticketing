import type { Booking } from '@app/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { bookingApi } from '../../api/booking';
import { EmptyState, ErrorState } from '../../components/query-state';
import { AppBar, Skeleton, Text } from '../../components/ui';
import { BookingCard } from '../../features/bookings/booking-card';
import { SavedTicketsList } from '../../features/bookings/saved-tickets-list';
import { listSavedTickets, type SavedTicket } from '../../features/bookings/ticket-vault';
import { SponsoredCard } from '../../features/promos/sponsored-card';
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

  /**
   * Read once at mount, so the fallback below is ready the moment the list
   * fails rather than after a second spinner. Cheap: a dozen small reads.
   */
  const [saved, setSaved] = useState<SavedTicket[]>([]);
  useEffect(() => {
    let cancelled = false;
    void listSavedTickets().then((tickets) => {
      if (!cancelled) setSaved(tickets);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
              backgroundColor: selected ? colors.primarySolid : colors.surface,
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
        // A phone that kept tickets has something better to offer than an
        // error, and this is the screen those tickets are reached through.
        saved.length > 0 ? (
          <SavedTicketsList
            tickets={saved}
            retrying={bookings.isRefetching}
            onRetry={() => void bookings.refetch()}
          />
        ) : (
          <ErrorState
            error={bookings.error}
            title="Could not load your bookings"
            onRetry={() => void bookings.refetch()}
          />
        )
      ) : (
        <Animated.View key={tab} entering={FadeIn.duration(180)} style={{ flex: 1 }}>
          <FlatList
            data={list}
            keyExtractor={(booking) => booking.id}
            ListHeaderComponent={header}
            renderItem={({ item, index }) => (
              <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 40).duration(260)}>
                <BookingCard
                  booking={item}
                  onPress={() => router.push(`/booking/${item.reference}`)}
                  // Only a film can be seen again. A past fixture is past.
                  onRebook={
                    tab === 'past' && item.showtime.movie
                      ? () => router.push(`/movie/${item.showtime.movie!.id}`)
                      : undefined
                  }
                />
              </Animated.View>
            )}
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing['2xl'],
              gap: spacing.md,
              // So ListEmptyComponent has the screen's height to centre in.
              flexGrow: 1,
            }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={bookings.isRefetching}
                onRefresh={() => void bookings.refetch()}
                tintColor={colors.primary}
              />
            }
            // A rewatch prompt, and only here: upcoming holds live tickets,
            // nothing to sell against; past is where "watch something else
            // next" actually belongs.
            ListFooterComponent={
              tab === 'past' && list.length > 0 ? (
                <SponsoredCard
                  icon="film-outline"
                  title="Missed one?"
                  body="It's probably still playing somewhere nearby."
                  onPress={() => router.push('/(tabs)')}
                />
              ) : null
            }
            ListEmptyComponent={
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
            }
          />
        </Animated.View>
      )}
    </View>
  );
}
