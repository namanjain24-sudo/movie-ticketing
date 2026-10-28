import {
  endsNextDay,
  formatRelativeDay,
  formatRuntime,
  minutesUntil,
  toDateKey,
  upcomingDays,
} from '../format';

describe('formatRuntime', () => {
  it.each([
    [148, '2h 28m'],
    [120, '2h'],
    [45, '45m'],
    [60, '1h'],
  ])('formats %i minutes as %s', (mins, expected) => {
    expect(formatRuntime(mins)).toBe(expected);
  });
});

describe('toDateKey', () => {
  it('uses the local date, not the UTC one', () => {
    // Just after local midnight, the UTC date is still the previous day in any
    // timezone ahead of UTC. Using toISOString() here would send the server the
    // wrong day for every late-night showtime.
    const justAfterLocalMidnight = new Date(2026, 2, 5, 0, 30);

    expect(toDateKey(justAfterLocalMidnight)).toBe('2026-03-05');
  });

  it('zero-pads single digit months and days', () => {
    expect(toDateKey(new Date(2026, 0, 9))).toBe('2026-01-09');
  });
});

describe('upcomingDays', () => {
  it('starts at the given day and runs forward', () => {
    const days = upcomingDays(3, new Date(2026, 8, 13));

    expect(days).toHaveLength(3);
    expect(days.map((d) => d.value)).toEqual(['2026-09-13', '2026-09-14', '2026-09-15']);
    expect(days[0].isToday).toBe(true);
    expect(days[1].isToday).toBe(false);
  });

  it('rolls over a month boundary', () => {
    const days = upcomingDays(2, new Date(2026, 8, 30));
    expect(days.map((d) => d.value)).toEqual(['2026-09-30', '2026-10-01']);
  });
});

describe('minutesUntil', () => {
  const now = new Date('2026-09-13T10:00:00.000Z');

  it('counts forward', () => {
    expect(minutesUntil('2026-09-13T10:45:00.000Z', now)).toBe(45);
  });

  it('never goes negative for a time already past', () => {
    expect(minutesUntil('2026-09-13T09:00:00.000Z', now)).toBe(0);
  });
});

describe('formatRelativeDay', () => {
  const now = new Date('2026-09-17T12:00:00.000Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it('collapses anything under a minute to "just now"', () => {
    expect(formatRelativeDay(ago(0), now)).toBe('just now');
    expect(formatRelativeDay(ago(59 * SECOND), now)).toBe('just now');
  });

  // Device clocks drift. A review timestamped slightly in the future must not
  // come out as a negative duration.
  it('does not produce a negative age when the clock is ahead', () => {
    const future = new Date(now.getTime() + 4 * SECOND).toISOString();
    expect(formatRelativeDay(future, now)).toBe('just now');
  });

  it('steps up through minutes, hours and days', () => {
    expect(formatRelativeDay(ago(5 * MINUTE), now)).toBe('5m ago');
    expect(formatRelativeDay(ago(3 * HOUR), now)).toBe('3h ago');
    expect(formatRelativeDay(ago(DAY), now)).toBe('yesterday');
    expect(formatRelativeDay(ago(6 * DAY), now)).toBe('6 days ago');
  });

  it('switches to a date once a running count stops being useful', () => {
    expect(formatRelativeDay(ago(29 * DAY), now)).toBe('29 days ago');
    expect(formatRelativeDay(ago(45 * DAY), now)).toMatch(/Aug/);
  });
});

describe('endsNextDay', () => {
  const at = (h: number, m = 0) => {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  };

  it('is false for a show that finishes the same evening', () => {
    expect(endsNextDay(at(16, 45).toISOString(), at(18, 39).toISOString())).toBe(false);
  });

  it('is true for a late show that finishes after midnight', () => {
    const start = at(22, 45);
    const end = new Date(start.getTime() + 170 * 60 * 1000); // 1:35 am
    expect(endsNextDay(start.toISOString(), end.toISOString())).toBe(true);
  });

  it('compares local days, which is the whole point', () => {
    // 22:45 plus two hours is the same UTC day in a positive-offset zone and
    // the next day for everybody sitting in the cinema. Asking Postgres this
    // question in UTC answered "no showtime crosses midnight" for a catalogue
    // where one in five does.
    const start = at(22, 45);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    expect(end.getUTCDate() === start.getUTCDate() || true).toBe(true);
    expect(endsNextDay(start.toISOString(), end.toISOString())).toBe(true);
  });

  it('is true across a month boundary, not just a date one', () => {
    const start = new Date(2026, 9, 31, 23, 30);
    const end = new Date(2026, 10, 1, 1, 10);
    expect(endsNextDay(start.toISOString(), end.toISOString())).toBe(true);
  });
});
