/**
 * Reanimated runs its animations on a separate worklet runtime, which does not
 * exist in Node. Without this, importing any component that touches Reanimated
 * throws while the native worklets module is being installed — so the failure
 * shows up as "cannot read properties of undefined", several frames deep,
 * before a single line of the component has run.
 *
 * The shipped mock replaces the animation machinery with synchronous
 * no-ops. Values are set immediately rather than over time, which is exactly
 * what a test wants: it asserts on the destination, never on the tween.
 */
// Worklets first: Reanimated's own mock imports Reanimated, which imports
// this, which throws while installing a native module that is not there. Both
// libraries ship a mock; both have to be in place.
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
/**
 * Reanimated's shipped mock does not implement `useReducedMotion`, so any
 * component that asks the OS whether to animate — the splash, the sponsor
 * films, the typing dots — throws on import rather than rendering. Answering
 * "no" is also the right default for a test: the assertions are about the
 * destination, and reduce-motion is the path that skips the journey.
 */
jest.mock('react-native-reanimated', () => ({
  ...require('react-native-reanimated/mock'),
  useReducedMotion: () => false,
}));

/**
 * Native maps have no headless implementation, so the map renders as a plain
 * view with its markers as children. Every test that touches a map screen is
 * about what is *on* the map — which cinemas, in what order — and that survives
 * the substitution intact.
 */
jest.mock('react-native-maps', () => {
  const { View } = require('react-native');
  const React = require('react');
  const MockMapView = React.forwardRef(({ children, ...props }, ref) => {
    React.useImperativeHandle(ref, () => ({ animateToRegion: jest.fn() }));
    return React.createElement(View, props, children);
  });
  MockMapView.displayName = 'MapView';
  const MockMarker = (props) => React.createElement(View, props, props.children);
  return {
    __esModule: true,
    default: MockMapView,
    Marker: MockMarker,
    PROVIDER_GOOGLE: 'google',
    PROVIDER_DEFAULT: undefined,
  };
});

/**
 * `ReanimatedSwipeable` measures the row natively to work out swipe
 * thresholds, which never resolves under Jest — a test that mounts one hangs
 * rather than fails. The gesture itself is the library's own concern, already
 * covered by its own test suite; what an app test needs is the row's content
 * and its revealed actions, so the mock renders both, permanently "open",
 * with a real ref shape for any `swipeableRef.current?.close()` call.
 */
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { View } = require('react-native');
  const React = require('react');
  const progress = { value: 1 };
  const MockSwipeable = React.forwardRef(({ children, renderRightActions }, ref) => {
    React.useImperativeHandle(ref, () => ({
      close: jest.fn(),
      openLeft: jest.fn(),
      openRight: jest.fn(),
      reset: jest.fn(),
    }));
    return React.createElement(
      View,
      null,
      children,
      renderRightActions ? renderRightActions(progress, progress) : null,
    );
  });
  MockSwipeable.displayName = 'ReanimatedSwipeable';
  return { __esModule: true, default: MockSwipeable };
});

/**
 * `createURL` reads the app's scheme from the native manifest via
 * expo-constants, which does not exist under Jest. A test only needs a
 * deterministic string back, not the real scheme resolution.
 */
jest.mock('expo-linking', () => ({
  createURL: (path) => `mobileapp://${path.replace(/^\//, '')}`,
}));

/**
 * `expo-secure-store` has no headless implementation, and under Jest its
 * native call never settles. Three providers read from it while they mount
 * (`ThemeProvider`, `AuthProvider`, `OnboardingProvider`), so any test that
 * renders one leaves a promise pending for the life of the worker. Jest then
 * reports "a worker process has failed to exit gracefully" and **exits 1 even
 * though every test passed**, which makes a green suite indistinguishable
 * from a red one in CI.
 *
 * An in-memory store settles immediately and is closer to the real thing than
 * a call that hangs: reads come back, writes stick for the rest of the file.
 * Tests that care about persistence still mock `lib/storage` themselves.
 */
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
    getItemAsync: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    setItemAsync: jest.fn(async (key, value) => void store.set(key, value)),
    deleteItemAsync: jest.fn(async (key) => void store.delete(key)),
    isAvailableAsync: jest.fn(async () => true),
  };
});

/**
 * No unit test talks to the network.
 *
 * `cinema-card.test.tsx` did, without anybody meaning it to: the card mounts
 * `useFavoriteCinemas` to draw its heart, and that hook asked the server which
 * cinemas are pinned. The request was real and it went to the default
 * `http://localhost:4000` — which on this machine is a different project
 * altogether. Nothing failed, because the card does not need the answer in
 * order to render, so a unit suite had been quietly posting to whatever
 * happened to be listening on a neighbouring port.
 *
 * A component that fetches mocks the api module it calls, the way
 * support.test.tsx and auth-store.test.ts already do. This turns forgetting
 * into a named error instead of a silent request.
 */
global.fetch = jest.fn((input) => {
  const url = typeof input === 'string' ? input : (input?.url ?? String(input));
  return Promise.reject(
    new Error(
      `Unmocked network call in a test: ${url}\n` +
        'Mock the api module the component under test calls, e.g.\n' +
        "  jest.mock('../../../api/favorite-cinemas', () => ({ favoriteCinemasApi: { list: jest.fn(async () => []) } }));",
    ),
  );
});
