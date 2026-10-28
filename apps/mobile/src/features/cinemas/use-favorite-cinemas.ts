import type { CinemaDirectoryEntry } from '@app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { favoriteCinemasApi } from '../../api/favorite-cinemas';
import { useAuth } from '../auth/auth-provider';
import { signInThenReturn } from '../auth/return-to';
import { successFeedback, tapFeedback } from '../../lib/haptics';
import { queryKeys } from '../../lib/query-client';
import { withoutSavedCinema, withSavedCinema } from './favorite-cinemas-cache';

/**
 * The signed-in user's pinned cinemas, and a way to change them. Mirrors
 * use-watchlist.ts exactly — same optimistic-toggle shape, same reasoning: a
 * heart that waits for a round trip feels broken, one that lies is worse.
 */
export function useFavoriteCinemas() {
  const { isSignedIn } = useAuth();
  const here = usePathname();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.favoriteCinemas,
    queryFn: favoriteCinemasApi.list,
    staleTime: 60_000,
    // Somebody's own list, so it is not asked for until there is a
    // somebody. A 401 here would sign the session out and bounce a visitor
    // who is only browsing to the sign-in form.
    enabled: isSignedIn,
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
      // Pinned cinemas are kept for somebody. Same reasoning as the watchlist
      // heart: the tap is answered with the form, not with a 401.
      if (!isSignedIn) {
        tapFeedback();
        signInThenReturn(here);
        return;
      }
      const save = !savedIds.has(cinema.id);
      if (save) successFeedback();
      else tapFeedback();
      mutation.mutate({ cinema, save });
    },
    [isSignedIn, here, mutation, savedIds],
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
