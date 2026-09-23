import { holdNudgeTime, releaseCheckTime, showtimeReminderTime } from '../scheduling';

const NOW = new Date('2026-09-13T12:00:00.000Z');

describe('showtimeReminderTime', () => {
  it('fires two hours before the showtime', () => {
    const fireAt = showtimeReminderTime('2026-09-13T18:00:00.000Z', NOW);
    expect(fireAt?.toISOString()).toBe('2026-09-13T16:00:00.000Z');
  });

  it('returns null once the lead time itself has already passed', () => {
    // Showtime is 90 minutes out — inside the two-hour lead, so a reminder
    // "two hours before" would have to fire in the past.
    const fireAt = showtimeReminderTime('2026-09-13T13:30:00.000Z', NOW);
    expect(fireAt).toBeNull();
  });

  it('returns null for a showtime that has already started', () => {
    const fireAt = showtimeReminderTime('2026-09-13T11:00:00.000Z', NOW);
    expect(fireAt).toBeNull();
  });
});

describe('holdNudgeTime', () => {
  const EXPIRES_AT = '2026-09-13T12:05:00.000Z'; // 5 minutes of hold

  it('fires one minute before the hold expires when the device clock agrees with the server', () => {
    const fireAt = holdNudgeTime(EXPIRES_AT, NOW.toISOString(), NOW);
    expect(fireAt?.toISOString()).toBe('2026-09-13T12:04:00.000Z');
  });

  it('anchors to server time, not the device clock, when the two disagree', () => {
    // The phone is two minutes fast, so naively the nudge would fire two
    // minutes too early relative to when the server actually expires the hold.
    const deviceNow = new Date('2026-09-13T12:02:00.000Z');
    const fireAt = holdNudgeTime(EXPIRES_AT, NOW.toISOString(), deviceNow);
    // On the device's own clock, the real deadline is 12:07 (server 12:05 plus
    // the two-minute skew), so the nudge lands at 12:06 device-time.
    expect(fireAt?.toISOString()).toBe('2026-09-13T12:06:00.000Z');
  });

  it('returns null when less than the lead time remains on the hold', () => {
    // serverTime is fresh here, sampled at the same moment as `now` — a stale
    // serverTime from minutes earlier is not how the real call site uses this,
    // since the hold query refetches on focus before a background event fires.
    const almostExpired = new Date('2026-09-13T12:04:30.000Z');
    const fireAt = holdNudgeTime(EXPIRES_AT, almostExpired.toISOString(), almostExpired);
    expect(fireAt).toBeNull();
  });

  it('returns null for a hold that has already expired', () => {
    const afterExpiry = new Date('2026-09-13T12:06:00.000Z');
    const fireAt = holdNudgeTime(EXPIRES_AT, afterExpiry.toISOString(), afterExpiry);
    expect(fireAt).toBeNull();
  });
});

describe('releaseCheckTime', () => {
  it('fires exactly on the release date', () => {
    const fireAt = releaseCheckTime('2026-10-01T00:00:00.000Z', NOW);
    expect(fireAt?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('returns null once the release date has passed', () => {
    expect(releaseCheckTime('2026-09-01T00:00:00.000Z', NOW)).toBeNull();
  });

  it('returns null for a release date at this exact instant', () => {
    expect(releaseCheckTime(NOW.toISOString(), NOW)).toBeNull();
  });
});
