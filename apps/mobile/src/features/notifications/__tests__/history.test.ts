import { loadNotificationHistory, recordNotificationHistory } from '../history';

/** `mock`-prefixed so the factory below may close over it. */
const mockStore = new Map<string, string>();

jest.mock('../../../lib/storage', () => ({
  STORAGE_KEYS: { notificationHistory: 'notifications.history' },
  secureStorage: {
    get: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    set: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
    remove: jest.fn(async (k: string) => void mockStore.delete(k)),
  },
}));

const KEY = 'notifications.history';

function reminder(n: number) {
  return {
    id: `showtime-reminder-cmvliup9e0002dxru0zef20v${n}`,
    kind: 'showtime-reminder' as const,
    title: 'Drishyam: The Conclusion starts in an hour',
    body: 'AMB Cinemas, Gachibowli · Audi 1 · Seats H10, H11. Leave enough time for the queue.',
  };
}

beforeEach(() => mockStore.clear());

describe('notification history', () => {
  it('keeps what it was given, newest first', async () => {
    await recordNotificationHistory(reminder(1));
    await recordNotificationHistory(reminder(2));

    const history = await loadNotificationHistory();
    expect(history).toHaveLength(2);
    expect(history[0]?.id).toContain('v2');
    expect(history[1]?.id).toContain('v1');
    expect(history[0]?.scheduledAt).toBeTruthy();
  });

  /**
   * Scheduling the same identifier again is a genuine new attempt — a retried
   * checkout, a film page opened twice — so it is recorded again rather than
   * deduplicated. This pins that down, because it reads like an oversight.
   */
  it('records a repeat of the same notification as its own entry', async () => {
    await recordNotificationHistory(reminder(1));
    await recordNotificationHistory(reminder(1));

    expect(await loadNotificationHistory()).toHaveLength(2);
  });

  it('keeps the newest thirty and drops the rest', async () => {
    for (let i = 0; i < 35; i += 1) {
      await recordNotificationHistory(reminder(i));
    }

    const history = await loadNotificationHistory();
    expect(history).toHaveLength(30);
    expect(history[0]?.id).toContain('v34');
    expect(history.map((h) => h.id)).not.toContain(reminder(0).id);
  });

  it('starts clean rather than throwing on a corrupt value', async () => {
    mockStore.set(KEY, 'not json');
    expect(await loadNotificationHistory()).toEqual([]);

    mockStore.set(KEY, '{"not":"an array"}');
    expect(await loadNotificationHistory()).toEqual([]);
  });

  it('has nothing to show before anything is scheduled', async () => {
    expect(await loadNotificationHistory()).toEqual([]);
  });
});
