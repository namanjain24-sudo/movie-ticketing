import { formatMoney } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { catalogApi } from '../../api/catalog';
import { plansApi } from '../../api/plans';
import { ErrorState, LoadingState } from '../../components/query-state';
import { AppBar, Button, Screen, Text } from '../../components/ui';
import { formatRelativeDay, formatTime } from '../../lib/format';
import { tapFeedback } from '../../lib/haptics';
import { queryKeys } from '../../lib/query-client';
import { useTheme } from '../../theme';
import { HIT_SIZE } from '../../theme/tokens';

/** The shortlist bounds, as the API enforces them. */
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

/**
 * Building the shortlist.
 *
 * Two to six showings, which is the same rule the API enforces and for the
 * same reasons: one is not a choice, and a shortlist nobody can hold in their
 * head is the problem a plan is meant to replace.
 *
 * One city only, so the list is already narrowed to the city the plan is for
 * rather than offering showings nobody in the group can reach.
 */
export default function NewPlanScreen() {
  const { movie: slug } = useLocalSearchParams<{ movie: string }>();
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();
  const [picked, setPicked] = useState<string[]>([]);

  const film = useQuery({
    queryKey: queryKeys.movie(slug ?? ''),
    queryFn: () => catalogApi.movie(slug ?? ''),
    enabled: Boolean(slug),
  });

  const movieId = film.data?.id;
  const showtimes = useQuery({
    queryKey: queryKeys.showtimes({ movieId }),
    queryFn: () => catalogApi.showtimes({ movieId }),
    enabled: Boolean(movieId),
  });

  const create = useMutation({
    mutationFn: () => plansApi.create({ movieId: movieId ?? '', showtimeIds: picked }),
    onSuccess: (plan) => router.replace(`/plan/${plan.code}`),
  });

  if (film.isPending || showtimes.isPending) return <LoadingState />;
  if (film.isError) {
    return <ErrorState title="Could not load that film" error={film.error} />;
  }

  // Flattened out of the by-cinema shape: a shortlist is read as a timetable,
  // so the cinema becomes a line on each row rather than a heading over several.
  const rows = (showtimes.data ?? [])
    .flatMap((entry) =>
      entry.showtimes.map((slot) => ({
        slot,
        cinemaName: entry.cinema.name,
        city: entry.cinema.city,
      })),
    )
    .sort((a, b) => new Date(a.slot.startsAt).getTime() - new Date(b.slot.startsAt).getTime());

  // The city the plan is in, decided by the first pick. The API refuses a
  // shortlist spanning two cities, and finding that out at the end - after
  // choosing six showings - would be the server teaching a rule the screen
  // could have shown.
  const lockedCity = rows.find((row) => picked.includes(row.slot.id))?.city;

  const toggle = (id: string) => {
    tapFeedback();
    setPicked((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length >= MAX_OPTIONS
          ? current
          : [...current, id],
    );
  };

  return (
    <Screen scroll>
      <AppBar
        title={film.data?.title ?? 'Plan'}
        subtitle={lockedCity ? `Watch party in ${lockedCity}` : 'Watch party'}
        onBack={() => router.back()}
        titleLines={2}
      />

      <View style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
        <Text variant="caption" tone="muted">
          Pick the showings that could work. Your friends mark the ones they can make, and the one
          most people can is the one to book.
          {lockedCity ? ` One city at a time, so this plan is ${lockedCity}.` : ''}
        </Text>

        {rows.length === 0 ? (
          <Text variant="body" tone="muted">
            Nothing is on for this film right now.
          </Text>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          {rows.map(({ slot, cinemaName, city }) => {
            const chosen = picked.includes(slot.id);
            const elsewhere = lockedCity !== undefined && city !== lockedCity;
            const full = !chosen && (picked.length >= MAX_OPTIONS || elsewhere);
            return (
              <Pressable
                key={slot.id}
                onPress={() => {
                  if (full) return;
                  toggle(slot.id);
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: chosen, disabled: full }}
                accessibilityLabel={`${formatRelativeDay(slot.startsAt)} ${formatTime(
                  slot.startsAt,
                )} at ${cinemaName}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  padding: spacing.lg,
                  minHeight: HIT_SIZE,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: chosen ? colors.primary : colors.border,
                  opacity: full ? 0.45 : 1,
                }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: radius.sm,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: chosen ? colors.primarySolid : 'transparent',
                    borderWidth: chosen ? 0 : 1,
                    borderColor: colors.borderStrong,
                  }}
                >
                  {chosen ? <Ionicons name="checkmark" size={15} color={colors.onPrimary} /> : null}
                </View>
                <View style={{ flex: 1, gap: spacing['2xs'] }}>
                  <Text variant="label" numeric>
                    {formatRelativeDay(slot.startsAt)}, {formatTime(slot.startsAt)}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {cinemaName}, {city}
                  </Text>
                </View>
                <Text variant="caption" tone="muted" numeric>
                  {formatMoney(slot.fromPriceMinor, slot.currency)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {create.isError ? (
          <Text variant="caption" tone="danger">
            That did not work. Check the showings are all still on and try again.
          </Text>
        ) : null}
      </View>

      <View style={{ paddingTop: spacing.xl, gap: spacing.sm }}>
        <Button
          label={
            picked.length < MIN_OPTIONS
              ? `Pick at least ${MIN_OPTIONS} showings`
              : `Create plan with ${picked.length} showings`
          }
          disabled={picked.length < MIN_OPTIONS}
          loading={create.isPending}
          onPress={() => create.mutate()}
        />
        <Text variant="caption" tone="muted" align="center">
          A plan holds no seats. Whoever books does that afterwards.
        </Text>
      </View>
    </Screen>
  );
}
