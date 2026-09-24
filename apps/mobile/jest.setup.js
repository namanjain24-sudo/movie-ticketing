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
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

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
