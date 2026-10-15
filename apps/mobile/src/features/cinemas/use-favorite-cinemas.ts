import type { CinemaDirectoryEntry } from '@app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { favoriteCinemasApi } from '../../api/favorite-cinemas';
import { successFeedback, tapFeedback } from '../../lib/haptics';
import { queryKeys } from '../../lib/query-client';
import { withoutSavedCinema, withSavedCinema } from './favorite-cinemas-cache';

/**
 * The signed-in user's pinned cinemas, and a way to change them. Mirrors
 * use-watchlist.ts exactly — same optimistic-toggle shape, same reasoning: a
 * heart that waits for a round trip feels broken, one that lies is worse.
 */
export function useFavoriteCinemas() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.favoriteCinemas,
    queryFn: favoriteCinemasApi.list,
    staleTime: 60_000,
  });

  const savedIds = useMemo(() => new Set((query.data ?? []).map((c) => c.id)), [query.data]);

  const mutation = useMutation({
    mutationFn: ({ cinema, save }: { cinema: CinemaDirectoryEntry; save: boolean }) =>
      save ? favoriteCinemasApi.save(cinema.slug) : favoriteCinemasApi.remove(cinema.slug),
    onMutate: async ({ cinema, save }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.favoriteCinemas });
      const previous = queryClient.getQueryData<CinemaDirectoryEntry[]>(queryKeys.favoriteCinemas);
      queryClient.setQueryData<CinemaDirectoryEntry[]>(queryKeys.favoriteCinemas, (current) =>
        save ? withSavedCinema(current, cinema) : withoutSavedCinema(current, cinema.id),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      queryClient.setQueryData(queryKeys.favoriteCinemas, context?.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.favoriteCinemas });
    },
  });

  const toggle = useCallback(
    (cinema: CinemaDirectoryEntry) => {
      const save = !savedIds.has(cinema.id);
      if (save) successFeedback();
      else tapFeedback();
      mutation.mutate({ cinema, save });
    },
    [mutation, savedIds],
  );

  return {
    cinemas: query.data,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    isSaved: (cinemaId: string) => savedIds.has(cinemaId),
    toggle,
  };
}
