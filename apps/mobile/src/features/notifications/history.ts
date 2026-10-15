import { secureStorage, STORAGE_KEYS } from '../../lib/storage';

export type NotificationKind = 'showtime-reminder' | 'hold-nudge' | 'release-check';

export interface NotificationHistoryEntry {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /**
   * When this was scheduled, not when — or whether — it actually fired. The
   * app has no way to observe a notification being delivered in the
   * background, the same honest limit `scheduleReleaseCheck` already
   * documents about its own release-day check-in.
   */
  scheduledAt: string;
}

const MAX_HISTORY = 30;

function parse(raw: string | null): NotificationHistoryEntry[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as NotificationHistoryEntry[]) : [];
  } catch {
    // Corrupt or pre-format data is not worth failing over — start clean.
    return [];
  }
}

/** Newest first, capped — scheduling the same identifier again (a retried
 * checkout, a re-opened film page) just adds another entry rather than
 * deduplicating, since each is a genuine new scheduling attempt. */
export async function recordNotificationHistory(
  entry: Omit<NotificationHistoryEntry, 'scheduledAt'>,
): Promise<void> {
  const current = parse(await secureStorage.get(STORAGE_KEYS.notificationHistory));
  const next = [{ ...entry, scheduledAt: new Date().toISOString() }, ...current].slice(
    0,
    MAX_HISTORY,
  );
  await secureStorage.set(STORAGE_KEYS.notificationHistory, JSON.stringify(next));
}

export async function loadNotificationHistory(): Promise<NotificationHistoryEntry[]> {
  return parse(await secureStorage.get(STORAGE_KEYS.notificationHistory));
}
