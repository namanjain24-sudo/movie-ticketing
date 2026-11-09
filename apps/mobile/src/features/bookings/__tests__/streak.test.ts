import type { BookingList } from '@app/shared';
import { bookingStreak } from '../streak';

/** Local noon on the 15th, so no assertion here depends on a timezone edge. */
const NOW = new Date(2026, 9, 15, 12, 0, 0); // October 2026

/** A confirmed booking, confirmed in the given local month. */
const booked = (year: number, month: number, day = 10) => ({
  id: `b-${year}-${month}`,
  status: 'CONFIRMED',
  confirmedAt: new Date(year, month - 1, day, 12).toISOString(),
});

const list = (...past: unknown[]): BookingList => ({ upcoming: [], past }) as never;

describe('bookingStreak', () => {
  it('is empty with nothing booked', () => {
    expect(bookingStreak(list(), NOW)).toEqual({
      current: 0,
      longest: 0,
      atRisk: false,
      months: [],
    });
  });

  it('is empty when there is no booking list yet', () => {
    expect(bookingStreak(undefined, NOW).current).toBe(0);
  });

  it('counts this month as one', () => {
    const s = bookingStreak(list(booked(2026, 10)), NOW);
    expect([s.current, s.longest, s.atRisk]).toEqual([1, 1, false]);
  });

  it('counts a run ending this month', () => {
    const s = bookingStreak(list(booked(2026, 8), booked(2026, 9), booked(2026, 10)), NOW);
    expect([s.current, s.longest]).toEqual([3, 3]);
  });

  it('counts several bookings in one month once', () => {
    const s = bookingStreak(list(booked(2026, 10, 2), booked(2026, 10, 20)), NOW);
    expect(s.current).toBe(1);
  });

  it('stops counting at the first gap', () => {
    // July, then nothing in August, then September and October.
    const s = bookingStreak(list(booked(2026, 7), booked(2026, 9), booked(2026, 10)), NOW);
    expect(s.current).toBe(2);
  });

  describe('the turn of the month', () => {
    it('keeps a run alive when this month is still empty', () => {
      // Nothing yet in October. A nine-month habit should not read as zero
      // because the calendar rolled over at midnight.
      const s = bookingStreak(list(booked(2026, 8), booked(2026, 9)), NOW);
      expect([s.current, s.atRisk]).toEqual([2, true]);
    });

    it('ends the run once a whole month has gone by', () => {
      // Last booking was August; September passed with nothing.
      const s = bookingStreak(list(booked(2026, 7), booked(2026, 8)), NOW);
      expect([s.current, s.atRisk]).toEqual([0, false]);
    });

    it('is not at risk while this month already has one', () => {
      const s = bookingStreak(list(booked(2026, 9), booked(2026, 10)), NOW);
      expect(s.atRisk).toBe(false);
    });
  });

  describe('longest', () => {
    it('finds a past run longer than the current one', () => {
      const s = bookingStreak(
        list(booked(2025, 1), booked(2025, 2), booked(2025, 3), booked(2025, 4), booked(2026, 10)),
        NOW,
      );
      expect([s.current, s.longest]).toEqual([1, 4]);
    });

    it('counts a run that crosses a year boundary', () => {
      const s = bookingStreak(list(booked(2025, 11), booked(2025, 12), booked(2026, 1)), NOW);
      expect(s.longest).toBe(3);
    });

    it('never reports a longest shorter than the current run', () => {
      const s = bookingStreak(list(booked(2026, 9), booked(2026, 10)), NOW);
      expect(s.longest).toBeGreaterThanOrEqual(s.current);
    });
  });

  describe('what counts', () => {
    it('ignores a cancelled booking', () => {
      const cancelled = { ...booked(2026, 10), status: 'CANCELLED' };
      expect(bookingStreak(list(cancelled), NOW).current).toBe(0);
    });

    it('ignores a booking that never confirmed', () => {
      const pending = { ...booked(2026, 10), status: 'PENDING', confirmedAt: null };
      expect(bookingStreak(list(pending), NOW).current).toBe(0);
    });

    it('ignores a date the server could not have sent', () => {
      const broken = { ...booked(2026, 10), confirmedAt: 'not-a-date' };
      expect(bookingStreak(list(broken), NOW).current).toBe(0);
    });

    it('counts a booking made this month for a show next month', () => {
      // The whole reason it counts `confirmedAt` and reads both lists: this
      // booking sits in `upcoming`, and it is what kept the run alive.
      const forward = { upcoming: [booked(2026, 10)], past: [booked(2026, 9)] } as never;
      expect(bookingStreak(forward, NOW).current).toBe(2);
    });
  });

  it('lists the months it counted, most recent first', () => {
    const s = bookingStreak(list(booked(2026, 9), booked(2026, 10)), NOW);
    expect(s.months).toEqual(['2026-10', '2026-09']);
  });
});
