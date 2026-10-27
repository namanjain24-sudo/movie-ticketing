import { act, renderHook } from '@testing-library/react-native';
import { useTickAt } from '../use-tick-at';

const START = new Date('2026-10-28T12:00:00.000Z').getTime();
const at = (mins: number) => START + mins * 60_000;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(START);
});
afterEach(() => {
  jest.useRealTimers();
});

describe('useTickAt', () => {
  it('reads the clock once and then holds still', async () => {
    const nextAfter = jest.fn(() => at(10));
    const { result } = await renderHook(() => useTickAt(nextAfter));

    expect(result.current).toBe(START);
    await act(async () => {
      jest.advanceTimersByTime(9 * 60_000);
    });
    // Nine minutes in and nothing is due, so nothing has re-rendered.
    expect(result.current).toBe(START);
  });

  it('wakes once the instant has passed', async () => {
    const nextAfter = jest.fn((now: number) => (now < at(10) ? at(10) : null));
    const { result } = await renderHook(() => useTickAt(nextAfter));

    await act(async () => {
      jest.advanceTimersByTime(10 * 60_000 + 1_000);
    });
    expect(result.current).toBe(at(10) + 1_000);
  });

  it('walks a schedule forwards one due thing at a time', async () => {
    const due = [at(5), at(12)];
    const nextAfter = (now: number) => due.find((d) => d > now) ?? null;
    const { result } = await renderHook(() => useTickAt(nextAfter));

    await act(async () => {
      jest.advanceTimersByTime(5 * 60_000 + 1_000);
    });
    expect(result.current).toBe(at(5) + 1_000);

    await act(async () => {
      jest.advanceTimersByTime(7 * 60_000);
    });
    expect(result.current).toBe(at(12) + 1_000);
  });

  it('stops for good when nothing is left due', async () => {
    // Asked through the hook's own behaviour rather than jest.getTimerCount,
    // which also counts the renderer's timers and so can never read zero.
    const nextAfter = jest.fn(() => null);
    const { result } = await renderHook(() => useTickAt(nextAfter));
    const asked = nextAfter.mock.calls.length;

    await act(async () => {
      jest.advanceTimersByTime(60 * 60_000);
    });

    // An hour on an old date: no wake, so no re-render, so nothing re-asked.
    expect(result.current).toBe(START);
    expect(nextAfter.mock.calls.length).toBe(asked);
  });

  it('does not sit in a loop when the answer is already behind the clock', async () => {
    // A caller answering with a past instant would otherwise be woken a
    // second later to give the same answer, and again, for the session.
    const nextAfter = jest.fn(() => at(-5));
    const { result } = await renderHook(() => useTickAt(nextAfter));
    const asked = nextAfter.mock.calls.length;

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    expect(result.current).toBe(START);
    expect(nextAfter.mock.calls.length).toBe(asked);
  });

  it('lets go of its timer when the screen does', async () => {
    // Matched on the hook's own delay — thirty minutes and the second it adds
    // — so the renderer's timers cannot be mistaken for it.
    const DELAY = 30 * 60_000 + 1_000;
    const set = jest.spyOn(global, 'setTimeout');
    const clear = jest.spyOn(global, 'clearTimeout');

    const { unmount } = await renderHook(() => useTickAt(() => at(30)));
    const mine = set.mock.results[set.mock.calls.findIndex((c) => c[1] === DELAY)]?.value;
    expect(mine).toBeDefined();

    await act(async () => {
      unmount();
    });

    expect(clear.mock.calls.some((c) => c[0] === mine)).toBe(true);
    set.mockRestore();
    clear.mockRestore();
  });
});
