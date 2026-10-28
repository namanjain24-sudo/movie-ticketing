// Learn more: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

/** Path separators and dots mean something to a regular expression. */
const escape = (value) => value.replace(/[/\\.+^$|()[\]{}*?]/g, '\\$&');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the whole workspace so edits to packages/shared trigger a reload.
config.watchFolders = [workspaceRoot];

/**
 * ...but not the parts of it this app can never import from.
 *
 * `watchFolders` above points metro at the monorepo root, and metro then
 * builds a file map of everything under it. That sweep included the git
 * database, both native build trees, the marketing site, the load tests and
 * the docs — about 425MB of directories nothing in `src` has ever resolved a
 * module from. It is work with no possible result.
 *
 * It is also the difference between a dev server that starts and one that
 * does not when the checkout happens to live somewhere a directory read is
 * expensive — a synced folder, a network volume — because the cost of the
 * sweep is paid in `readdir` calls rather than in CPU.
 *
 * `node_modules` is deliberately not here. Metro resolves out of it on every
 * import, so it has to be in the map.
 */
config.resolver.blockList = [
  /**
   * Tests, wherever they are.
   *
   * Expo Router builds its route tree with `require.context('./app')`, which
   * takes every .tsx under that directory. A test file that landed there was
   * therefore a module of the app: the production bundle followed it into
   * test-utils, then @testing-library/react-native, then `require('console')`
   * — which React Native does not have — and the release build failed at the
   * bundling step with that exact import stack.
   *
   * Moving the file fixed that one. This stops the next one, which would
   * otherwise be found the same way: by a release build, on the day somebody
   * wanted to ship.
   */
  /[\\/]__tests__[\\/].*$/,
  /\.(test|spec)\.[jt]sx?$/,

  new RegExp(`^${escape(path.join(workspaceRoot, '.git'))}\\/.*$`),
  new RegExp(`^${escape(path.join(workspaceRoot, 'apps', 'api'))}\\/.*$`),
  new RegExp(`^${escape(path.join(workspaceRoot, 'site'))}\\/.*$`),
  new RegExp(`^${escape(path.join(workspaceRoot, 'loadtest'))}\\/.*$`),
  new RegExp(`^${escape(path.join(workspaceRoot, 'docs'))}\\/.*$`),
  new RegExp(`^${escape(path.join(projectRoot, 'android'))}\\/.*$`),
  new RegExp(`^${escape(path.join(projectRoot, 'ios'))}\\/.*$`),
];

// Look in the app's own node_modules before the hoisted root ones, which is
// what lets a pinned version inside apps/mobile win over a hoisted mismatch.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
