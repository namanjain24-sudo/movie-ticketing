import type { MovieSummary } from '@app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { watchlistApi } from '../../api/watchlist';
import { successFeedback, tapFeedback } from '../../lib/haptics';
import { queryKeys } from '../../lib/query-client';
import { withSaved, withoutSaved } from './watchlist-cache';

/**
 * The signed-in user's saved films, and a way to change them.
 *
 * Every card on every screen calls this, so the list is fetched once and shared
 * through the query cache. A toggle edits that cache immediately and rolls it
 * back if the server refuses: a heart that waits for a round trip feels broken,
 * and a heart that lies about the outcome is worse.
 */
export function useWatchlist() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.watchlist,
    queryFn: watchlistApi.list,
    staleTime: 60_000,
  });

  const savedIds = useMemo(() => new Set((query.data ?? []).map((m) => m.id)), [query.data]);

  const mutation = useMutation({
    mutationFn: ({ movie, save }: { movie: MovieSummary; save: boolean }) =>
      save ? watchlistApi.save(movie.slug) : watchlistApi.remove(movie.slug),
    onMutate: async ({ movie, save }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.watchlist });
      const previous = queryClient.getQueryData<MovieSummary[]>(queryKeys.watchlist);
      queryClient.setQueryData<MovieSummary[]>(queryKeys.watchlist, (current) =>
        save ? withSaved(current, movie) : withoutSaved(current, movie.id),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      queryClient.setQueryData(queryKeys.watchlist, context?.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.watchlist });
    },
  });

  const toggle = useCallback(
    (movie: MovieSummary) => {
      const save = !savedIds.has(movie.id);
      if (save) successFeedback();
      else tapFeedback();
      mutation.mutate({ movie, save });
    },
    [mutation, savedIds],
  );

  return {
    movies: query.data,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    isSaved: (movieId: string) => savedIds.has(movieId),
    toggle,
  };
}
