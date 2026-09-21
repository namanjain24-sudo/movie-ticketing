import { act, renderHook } from '@testing-library/react-native';
import { useCountdown } from '../use-countdown';

const SERVER_NOW = '2026-09-13T12:00:00.000Z';
/** Five minutes of hold, which is what the API issues. */
const EXPIRES_AT = '2026-09-13T12:05:00.000Z';

describe('useCountdown', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** Puts the device clock at `iso`, which may disagree with the server. */
  function setDeviceClock(iso: string) {
    jest.setSystemTime(new Date(iso));
  }

  it('counts down from the remaining time', async () => {
    setDeviceClock(SERVER_NOW);
    const { result } = await renderHook(() => useCountdown(EXPIRES_AT, SERVER_NOW));

    expect(result.current.label).toBe('5:00');

    await act(async () => {
      jest.advanceTimersByTime(65_000);
    });

    expect(result.current.label).toBe('3:55');
  });

  it('trusts the server clock when the device clock is wrong', async () => {
    // The phone is two minutes fast. Taken at face value it would show 3:00
    // remaining on a hold the server will honour for another five minutes.
    setDeviceClock('2026-09-13T12:02:00.000Z');

    const { result } = await renderHook(() => useCountdown(EXPIRES_AT, SERVER_NOW));

    expect(result.current.label).toBe('5:00');
    expect(result.current.hasExpired).toBe(false);
  });

  it('does not report a hold as expired when the device clock runs slow', async () => {
    // The phone is ten minutes behind: naively, the hold looks fresh long
    // after the server has released the seats.
    setDeviceClock('2026-09-13T11:50:00.000Z');

    const { result } = await renderHook(() => useCountdown(EXPIRES_AT, SERVER_NOW));
    expect(result.current.label).toBe('5:00');

    await act(async () => {
      jest.advanceTimersByTime(5 * 60_000);
    });

    expect(result.current.hasExpired).toBe(true);
    expect(result.current.label).toBe('0:00');
  });

  it('floors at zero rather than going negative', async () => {
    setDeviceClock(SERVER_NOW);
    const { result } = await renderHook(() => useCountdown(EXPIRES_AT, SERVER_NOW));

    await act(async () => {
      jest.advanceTimersByTime(10 * 60_000);
    });

    expect(result.current.remainingMs).toBe(0);
    expect(result.current.label).toBe('0:00');
    expect(result.current.hasExpired).toBe(true);
  });

  it('turns urgent inside the last minute, but not while expired', async () => {
    setDeviceClock(SERVER_NOW);
    const { result } = await renderHook(() => useCountdown(EXPIRES_AT, SERVER_NOW));

    expect(result.current.isUrgent).toBe(false);

    await act(async () => {
      jest.advanceTimersByTime(4 * 60_000 + 30_000);
    });
    expect(result.current.isUrgent).toBe(true);
    expect(result.current.label).toBe('0:30');

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(result.current.isUrgent).toBe(false);
    expect(result.current.hasExpired).toBe(true);
  });

  it('stays idle until a deadline exists', async () => {
    setDeviceClock(SERVER_NOW);
    const { result } = await renderHook(() => useCountdown(undefined, undefined));

    expect(result.current.hasExpired).toBe(false);
    expect(result.current.label).toBe('0:00');
  });
});
