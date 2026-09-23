import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { authApi } from '../../api/auth';
import { bookingApi } from '../../api/booking';
import { ErrorState, LoadingState } from '../../components/query-state';
import { AppBar, Button, Text, TextField } from '../../components/ui';
import { useWatchlist } from '../../features/watchlist/use-watchlist';
import { useAuthStore } from '../../features/auth/auth-store';
import { tapFeedback } from '../../lib/haptics';
import { queryKeys } from '../../lib/query-client';
import { useTheme, type ThemePreference } from '../../theme';
import { HIT_SIZE } from '../../theme/tokens';

export default function Profile() {
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();
  const queryClient = useQueryClient();
  const signOut = useAuthStore((s) => s.signOut);
  const setUser = useAuthStore((s) => s.setUser);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState<string | null>(null);

  const {
    data: user,
    isPending,
    isError,
    refetch,
  } = useQuery({ queryKey: queryKeys.me, queryFn: authApi.me });

  // Not decoration: how many tickets you hold is the thing you came here for
  // after your own name.
  const bookings = useQuery({ queryKey: queryKeys.bookings, queryFn: bookingApi.bookings });
  const watchlist = useWatchlist();

  const save = useMutation({
    mutationFn: (nextName: string) => authApi.updateProfile({ name: nextName }),
    onSuccess: (updated) => {
      setUser(updated);
      queryClient.setQueryData(queryKeys.me, updated);
      setName(null);
      setEditing(false);
    },
  });

  if (isPending) return <LoadingState />;
  if (isError || !user) {
    return (
      <ErrorState error={null} title="Could not load your profile" onRetry={() => void refetch()} />
    );
  }

  const initials = user.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppBar title="Profile" subtitle="Account" />

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center', gap: spacing.md }}>
          <View
            style={{
              width: 76,
              height: 76,
              borderRadius: 38,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="title" style={{ color: colors.onPrimary }}>
              {initials || '?'}
            </Text>
          </View>

          {editing ? (
            <View style={{ width: '100%', gap: spacing.md }}>
              <TextField
                label="Display name"
                value={name ?? user.name}
                onChangeText={setName}
                autoFocus
                error={save.isError ? 'Could not save that name. Try again.' : undefined}
              />
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  size="md"
                  style={{ flex: 1 }}
                  onPress={() => {
                    setName(null);
                    setEditing(false);
                  }}
                />
                <Button
                  label="Save"
                  size="md"
                  style={{ flex: 1 }}
                  loading={save.isPending}
                  disabled={!name || name.trim() === user.name}
                  onPress={() => name && save.mutate(name.trim())}
                />
              </View>
            </View>
          ) : (
            <View style={{ alignItems: 'center', gap: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text variant="title">{user.name}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit display name"
                  hitSlop={10}
                  onPress={() => setEditing(true)}
                >
                  <Ionicons name="pencil" size={16} color={colors.textMuted} />
                </Pressable>
              </View>
              <Text variant="caption" tone="muted">
                {user.email}
              </Text>
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Stat label="Upcoming" value={bookings.data?.upcoming.length} />
          <Stat label="Films seen" value={bookings.data?.past.length} />
          <Stat label="Saved" value={watchlist.movies?.length} />
        </View>

        <View
          style={{
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            overflow: 'hidden',
          }}
        >
          <Row
            icon="ticket-outline"
            label="My bookings"
            onPress={() => router.push('/(tabs)/bookings')}
          />
          <Divider />
          <Row icon="heart-outline" label="Saved films" onPress={() => router.push('/watchlist')} />
          <Divider />
          <Row icon="film-outline" label="Browse films" onPress={() => router.push('/(tabs)')} />
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text variant="heading">Appearance</Text>
          <ThemeToggle />
        </View>

        <Button
          label="Sign out"
          variant="ghost"
          onPress={async () => {
            await signOut();
            queryClient.clear();
            router.replace('/(auth)/sign-in');
          }}
        />
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        padding: spacing.lg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        gap: spacing['2xs'],
      }}
    >
      {/* An em dash until the count is known, rather than a zero that is a lie
          for as long as the request is in flight. */}
      <Text variant="display" numeric>
        {value ?? '—'}
      </Text>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

function Row({
  icon,
  label,
  onPress,
}: {
  icon: 'ticket-outline' | 'film-outline' | 'heart-outline';
  label: string;
  onPress: () => void;
}) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: HIT_SIZE + 8,
        paddingHorizontal: spacing.lg,
        backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
      })}
    >
      <Ionicons name={icon} size={20} color={colors.textMuted} />
      <Text variant="label" style={{ flex: 1 }}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={colors.borderStrong} />
    </Pressable>
  );
}

function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
}

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
];

/** A three-way exclusive choice, styled as radio rows — the same shape
 * checkout uses for its payment method list, since this is that same kind
 * of choice: pick one, not a switch to flip. */
function ThemeToggle() {
  const { colors, radius, spacing, preference, setPreference } = useTheme();

  return (
    <View
      style={{
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        overflow: 'hidden',
      }}
    >
      {THEME_OPTIONS.map((option, index) => {
        const selected = option.value === preference;
        return (
          <View key={option.value}>
            {index > 0 ? <Divider /> : null}
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => {
                tapFeedback();
                setPreference(option.value);
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                minHeight: HIT_SIZE + 8,
                paddingHorizontal: spacing.lg,
                backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
              })}
            >
              <Ionicons
                name={option.icon}
                size={20}
                color={selected ? colors.primary : colors.textMuted}
              />
              <Text variant="label" style={{ flex: 1, color: selected ? colors.primary : colors.text }}>
                {option.label}
              </Text>
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={selected ? colors.primary : colors.borderStrong}
              />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
