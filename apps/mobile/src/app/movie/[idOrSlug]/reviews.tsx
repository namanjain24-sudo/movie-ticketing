import { REVIEW_SORTS, REVIEW_SORT_LABELS, type ReviewSort } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { catalogApi } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/client';
import { reviewsApi } from '../../../api/reviews';
import { EmptyState, ErrorState, LoadingState } from '../../../components/query-state';
import { AppBar, Button, Text } from '../../../components/ui';
import { useAuth } from '../../../features/auth/auth-provider';
import { RatingBreakdown } from '../../../features/reviews/rating-breakdown';
import { ReviewCard } from '../../../features/reviews/review-card';
import { ReviewComposer } from '../../../features/reviews/review-composer';
import { successFeedback } from '../../../lib/haptics';
import { queryKeys } from '../../../lib/query-client';
import { useTheme } from '../../../theme';

export default function ReviewsScreen() {
  const { idOrSlug } = useLocalSearchParams<{ idOrSlug: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, radius, spacing, elevation } = useTheme();
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();

  const [sort, setSort] = useState<ReviewSort>('helpful');
  const [starFilter, setStarFilter] = useState<number | undefined>(undefined);
  const [composerOpen, setComposerOpen] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  const query = { sort, rating: starFilter };

  const movie = useQuery({
    queryKey: queryKeys.movie(idOrSlug),
    queryFn: () => catalogApi.movie(idOrSlug),
    enabled: Boolean(idOrSlug),
  });

  const reviews = useQuery({
    queryKey: queryKeys.reviews(idOrSlug, query),
    queryFn: () => reviewsApi.list(idOrSlug, query),
    enabled: Boolean(idOrSlug),
  });

  /**
   * A write moves the average, which is printed on the detail screen and on
   * every card in the catalogue. Invalidating only this screen's query would
   * leave the poster grid quietly wrong until it happened to refetch.
   */
  const refreshRatings = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['reviews', idOrSlug] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.movie(idOrSlug) }),
      queryClient.invalidateQueries({ queryKey: ['movies'] }),
    ]);

  const save = useMutation({
    mutationFn: (input: { rating: number; body: string | null }) =>
      reviewsApi.upsert(idOrSlug, input),
    onSuccess: async () => {
      successFeedback();
      setComposerOpen(false);
      setWriteError(null);
      await refreshRatings();
    },
    onError: (error) =>
      setWriteError(
        error instanceof ApiRequestError ? error.message : 'Could not post your review.',
      ),
  });

  const remove = useMutation({
    mutationFn: () => reviewsApi.remove(idOrSlug),
    onSuccess: async () => {
      setComposerOpen(false);
      setWriteError(null);
      await refreshRatings();
    },
    onError: (error) =>
      setWriteError(
        error instanceof ApiRequestError ? error.message : 'Could not delete your review.',
      ),
  });

  const title = movie.data?.title ?? 'Reviews';

  if (reviews.isPending) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <AppBar title={title} subtitle="Reviews" onBack={() => router.back()} />
        <LoadingState label="Loading reviews" />
      </View>
    );
  }

  if (reviews.isError || !reviews.data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <AppBar title={title} subtitle="Reviews" onBack={() => router.back()} />
        <ErrorState
          error={reviews.error}
          title="Could not load reviews"
          onRetry={() => void reviews.refetch()}
        />
      </View>
    );
  }

  const data = reviews.data;

  const header = (
    <View style={{ gap: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm }}>
      <RatingBreakdown
        average={data.average}
        count={data.count}
        breakdown={data.breakdown}
        activeRating={starFilter}
        onFilter={setStarFilter}
      />

      {data.count > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
        >
          {starFilter !== undefined ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Clear the ${starFilter} star filter`}
              onPress={() => setStarFilter(undefined)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radius.full,
                backgroundColor: colors.primary,
              }}
            >
              <Text variant="label" tone="inverse" numeric>
                {starFilter} star
              </Text>
              <Ionicons name="close" size={14} color={colors.onPrimary} />
            </Pressable>
          ) : null}

          {REVIEW_SORTS.map((option) => {
            const active = sort === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setSort(option)}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  borderRadius: radius.full,
                  borderWidth: 1,
                  borderColor: active ? colors.accent : colors.border,
                  backgroundColor: active ? colors.accentMuted : colors.surface,
                }}
              >
                <Text variant="label" tone={active ? 'primary' : 'muted'}>
                  {REVIEW_SORT_LABELS[option]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppBar
        title={title}
        subtitle="Reviews"
        onBack={() => router.back()}
        actions={
          data.count > 0 ? (
            <Text variant="caption" tone="onChrome" numeric>
              {data.count}
            </Text>
          ) : null
        }
      />

      <FlatList
        data={data.reviews}
        keyExtractor={(review) => review.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <ReviewCard
            review={item}
            onEdit={
              item.mine
                ? () => {
                    setWriteError(null);
                    setComposerOpen(true);
                  }
                : undefined
            }
          />
        )}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing['3xl'],
          gap: spacing.md,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={reviews.isRefetching}
            onRefresh={() => void reviews.refetch()}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title={
              starFilter !== undefined
                ? `No ${starFilter}-star reviews`
                : 'Nobody has written one yet'
            }
            message={
              starFilter !== undefined
                ? 'Clear the filter to see the rest.'
                : 'If you have seen it, yours would be the first.'
            }
            action={
              starFilter !== undefined
                ? { label: 'Clear filter', onPress: () => setStarFilter(undefined) }
                : undefined
            }
          />
        }
      />

      <View
        style={[
          {
            backgroundColor: colors.surface,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: insets.bottom + spacing.md,
          },
          elevation.raised,
        ]}
      >
        <Button
          label={
            !isSignedIn ? 'Sign in to review' : data.mine ? 'Edit your review' : 'Write a review'
          }
          variant={data.mine ? 'secondary' : 'primary'}
          onPress={() => {
            if (!isSignedIn) {
              router.push('/(auth)/sign-in');
              return;
            }
            setWriteError(null);
            setComposerOpen(true);
          }}
        />
      </View>

      <ReviewComposer
        visible={composerOpen}
        movieTitle={title}
        existing={data.mine}
        submitting={save.isPending}
        deleting={remove.isPending}
        error={writeError}
        onSubmit={(input) => save.mutate(input)}
        onDelete={() => remove.mutate()}
        onClose={() => setComposerOpen(false)}
      />
    </View>
  );
}
