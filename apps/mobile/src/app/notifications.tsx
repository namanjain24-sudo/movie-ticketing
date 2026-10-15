import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import { AppBar, Text } from '../components/ui';
import { EmptyState } from '../components/query-state';
import {
  loadNotificationHistory,
  type NotificationHistoryEntry,
} from '../features/notifications/history';
import { formatMonthDay, formatTime } from '../lib/format';
import { useTheme } from '../theme';

const KIND_ICON: Record<NotificationHistoryEntry['kind'], keyof typeof Ionicons.glyphMap> = {
  'showtime-reminder': 'film-outline',
  'hold-nudge': 'timer-outline',
  'release-check': 'calendar-outline',
};

/**
 * A browsable history of what's been scheduled — showtime reminders, hold
 * nudges, release-day check-ins — none of which had anywhere to be seen
 * before beyond the OS's own notification tray. Says "scheduled", never
 * "sent": the app has no way to observe a background notification actually
 * firing, the same honest limit scheduleReleaseCheck's own doc comment
 * already draws for release checks specifically.
 */
export default function NotificationsScreen() {
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const [entries, setEntries] = useState<NotificationHistoryEntry[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      void loadNotificationHistory().then(setEntries);
    }, []),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppBar title="Notifications" subtitle="What's been scheduled" onBack={() => router.back()} />

      {entries === null ? null : entries.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="Nothing yet"
          message="Showtime reminders and other nudges you've scheduled will show up here."
        />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(entry) => `${entry.id}-${entry.scheduledAt}`}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View
              style={{
                flexDirection: 'row',
                gap: spacing.md,
                padding: spacing.md,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <Ionicons name={KIND_ICON[item.kind]} size={20} color={colors.accent} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label">{item.title}</Text>
                <Text variant="caption" tone="muted">
                  {item.body}
                </Text>
                <Text variant="caption" tone="muted" numeric>
                  Scheduled {formatMonthDay(item.scheduledAt)} · {formatTime(item.scheduledAt)}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}
