import { act, renderHook } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { useLastKnownLocation, useUserLocation } from '../use-location';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

const permission = Location.requestForegroundPermissionsAsync as jest.Mock;
const position = Location.getCurrentPositionAsync as jest.Mock;

const grant = (lat: number, lng: number) => {
  permission.mockResolvedValue({ status: 'granted' });
  position.mockResolvedValue({ coords: { latitude: lat, longitude: lng } });
};
const refuse = () => permission.mockResolvedValue({ status: 'denied' });

/**
 * Both hooks together, and a clean slate.
 *
 * The remembered position is module state on purpose — it is a fact about the
 * session, not about any one screen — so each test starts by clearing it
 * through the same control the UI uses. (`jest.isolateModules` would be the
 * other way to get a fresh copy, and it hands the hooks a second React whose
 * dispatcher the renderer has never heard of.)
 */
async function renderFresh() {
  const view = await renderHook(() => ({
    asking: useUserLocation(),
    known: useLastKnownLocation(),
  }));
  await act(async () => {
    view.result.current.asking.clear();
  });
  return view;
}

beforeEach(() => {
  permission.mockReset();
  position.mockReset();
});

describe('the remembered position', () => {
  it('is empty until somebody grants one', async () => {
    const { result } = await renderFresh();
    expect(result.current.known).toBeNull();
  });

  it('is kept once somebody does', async () => {
    const { result } = await renderFresh();
    grant(19.0596, 72.8295);

    await act(async () => {
      await result.current.asking.request();
    });

    expect(result.current.known).toEqual({ lat: 19.0596, lng: 72.8295 });
  });

  it('reaches a screen that is already open', async () => {
    const reading = await renderFresh();
    expect(reading.result.current.known).toBeNull();

    grant(12.9716, 77.5946);
    const asking = await renderHook(() => useUserLocation());
    await act(async () => {
      await asking.result.current.request();
    });

    expect(reading.result.current.known).toEqual({ lat: 12.9716, lng: 77.5946 });
  });

  it('remembers nothing when the permission is refused', async () => {
    const { result } = await renderFresh();
    refuse();

    await act(async () => {
      await result.current.asking.request();
    });

    expect(result.current.asking.state).toEqual({ status: 'denied' });
    expect(result.current.known).toBeNull();
  });

  it('forgets it when the person turns it off', async () => {
    const { result } = await renderFresh();
    grant(19.0596, 72.8295);
    await act(async () => {
      await result.current.asking.request();
    });
    expect(result.current.known).not.toBeNull();

    // Turning it off on the one screen that asks turns it off everywhere.
    // Half a retraction is not one.
    await act(async () => {
      result.current.asking.clear();
    });

    expect(result.current.known).toBeNull();
  });

  /**
   * Last on purpose. It unmounts a hook by hand, and the renderer does not
   * hand back a usable result for anything rendered after that in the same
   * file — so this one goes where it cannot take the others with it.
   */
  it('outlives the screen that asked for it', async () => {
    const first = await renderFresh();
    grant(18.922, 72.8347);
    await act(async () => {
      await first.result.current.asking.request();
    });
    // The Cinemas tab goes away. A film page opened afterwards should not have
    // to ask again, on a screen where the question arrives unexplained.
    first.unmount();

    const reading = await renderHook(() => useLastKnownLocation());
    expect(reading.result.current).toEqual({ lat: 18.922, lng: 72.8347 });
  });
});
