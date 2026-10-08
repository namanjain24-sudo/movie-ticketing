import { act, renderHook } from '@testing-library/react-native';
import { useDebouncedValue } from '../use-debounced-value';

/** Real timers, short delays: avoids the flakiness of fake timers across an act()/setTimeout boundary. */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    await act(() => sleep(10));
    expect(result.current).toBe('s');
  });

  it('updates once the delay elapses', async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 20),
      { initialProps: { value: 's' } },
    );

    await rerender({ value: 'sa' });
    await act(() => sleep(40));
    expect(result.current).toBe('sa');
  });

  it('only settles on the last of several rapid changes, not every one', async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 40),
      { initialProps: { value: '' } },
    );

    for (const value of ['s', 'sa', 'sar', 'sard', 'sarda', 'sardar']) {
      await rerender({ value });
      await act(() => sleep(10));
    }
    expect(result.current).toBe(''); // every change arrived within 40ms of the last

    await act(() => sleep(50));
    expect(result.current).toBe('sardar');
  });
});
