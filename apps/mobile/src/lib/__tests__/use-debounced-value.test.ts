import { act, renderHook } from '@testing-library/react-native';
import { useDebouncedValue } from '../use-debounced-value';

/**
 * Fake timers, so the assertions are about the debounce and not about how busy
 * the machine is.
 *
 * This file used real timers and short sleeps, which made the "rapid changes"
 * case fail whenever something else was using the CPU: six `sleep(10)` calls
 * only stay inside a 40ms window while each one actually takes about 10ms, and
 * under load they do not. Advancing the clock by hand removes the machine from
 * the test entirely.
 */
const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

/**
 * This is what keeps the home screen's search box typeable: see the comment
 * on `useDebouncedValue` for why an undebounced value reaching a query key
 * drops keystrokes on web.
 */
describe('useDebouncedValue', () => {
  it('holds the initial value immediately', async () => {
    const { result } = await renderHook(() => useDebouncedValue('a', 20));
    expect(result.current).toBe('a');
  });

  it('does not update before the delay elapses', async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 40),
      { initialProps: { value: 's' } },
    );

    await rerender({ value: 'sa' });
    await advance(39);
    expect(result.current).toBe('s');
  });

  it('updates once the delay elapses', async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 20),
      { initialProps: { value: 's' } },
    );

    await rerender({ value: 'sa' });
    await advance(20);
    expect(result.current).toBe('sa');
  });

  it('only settles on the last of several rapid changes, not every one', async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 40),
      { initialProps: { value: '' } },
    );

    // Six keystrokes, each 10ms after the last: the 40ms timer is restarted
    // every time and never gets to fire.
    for (const value of ['s', 'sa', 'sar', 'sard', 'sarda', 'sardar']) {
      await rerender({ value });
      await advance(10);
    }
    expect(result.current).toBe('');

    // Stop typing, and only the final value lands.
    await advance(40);
    expect(result.current).toBe('sardar');
  });
});
