import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Where the API lives, resolved per device rather than hard-coded.
 *
 * `localhost` is the single most common reason the app boots to a network
 * error: on a phone running Expo Go it means *the phone*, which is not running
 * the API. Nothing in the bundle can tell the developer that, so the app just
 * says "cannot reach the server" while the server is perfectly fine.
 *
 * The dev server already knows the right answer. Metro served this bundle from
 * the host machine's LAN address, so that address is reachable from the device
 * by construction — otherwise the app would not be running at all. We take the
 * host from there and keep only the port from configuration.
 */

/** Hosts that mean "this device", and are therefore wrong on a real phone. */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

/** The Android emulator's alias for the host machine's loopback. */
const ANDROID_EMULATOR_HOST = '10.0.2.2';

const DEFAULT_PORT = '4000';

/**
 * The host Metro is being served from, e.g. `192.168.1.5` out of
 * `192.168.1.5:8081`. Present in Expo Go and in dev builds; absent in a
 * production build, where the API URL has to be a real one anyway.
 */
export function devServerHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    // Alternate shapes across Expo Go versions. A wrong answer here is a blank
    // app, so it is worth checking all of them.
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost ??
    (Constants.manifest2 as { extra?: { expoGo?: { debuggerHost?: string } } } | undefined)?.extra
      ?.expoGo?.debuggerHost;

  const host = hostUri?.split('://').pop()?.split('/')[0]?.split(':')[0];
  return host && !LOOPBACK.has(host) ? host : null;
}

/** Splits `http://host:port/path` into parts we can recombine, port optional. */
export function parseUrl(
  url: string,
): { protocol: string; host: string; port: string; path: string } | null {
  const match = /^(https?:)\/\/([^/:]+|\[[^\]]+\])(?::(\d+))?(\/.*)?$/i.exec(url.trim());
  if (!match) return null;
  const protocol = match[1].toLowerCase();
  return {
    protocol,
    host: match[2],
    port: match[3] ?? (protocol === 'https:' ? '443' : '80'),
    path: match[4]?.replace(/\/$/, '') ?? '',
  };
}

/** How the base URL was arrived at, surfaced in the connection diagnostic. */
export type ApiUrlSource = 'env' | 'dev-server' | 'android-emulator' | 'localhost';

export function resolveApiUrl(
  configured: string | undefined,
  platform: string,
  host: string | null,
): { url: string; source: ApiUrlSource } {
  const parsed = configured ? parseUrl(configured) : null;

  // A configured non-loopback URL is a deliberate choice — a staging server, a
  // tunnel — and is always honoured.
  if (parsed && !LOOPBACK.has(parsed.host)) {
    return {
      url: `${parsed.protocol}//${parsed.host}:${parsed.port}${parsed.path}`,
      source: 'env',
    };
  }

  const protocol = parsed?.protocol ?? 'http:';
  const port = parsed?.port ?? DEFAULT_PORT;
  const path = parsed?.path ?? '';

  // Web runs in a browser on the same machine as the API, so loopback is right.
  if (platform === 'web') {
    return { url: `${protocol}//localhost:${port}${path}`, source: 'localhost' };
  }

  if (host) {
    return { url: `${protocol}//${host}:${port}${path}`, source: 'dev-server' };
  }

  // No dev server to learn from: an emulator still has a fixed alias for the
  // host, and the iOS simulator genuinely shares the host's loopback.
  if (platform === 'android') {
    return {
      url: `${protocol}//${ANDROID_EMULATOR_HOST}:${port}${path}`,
      source: 'android-emulator',
    };
  }
  return { url: `${protocol}//localhost:${port}${path}`, source: 'localhost' };
}

const resolved = resolveApiUrl(
  process.env.EXPO_PUBLIC_API_URL?.trim(),
  Platform.OS,
  devServerHost(),
);

export const config = {
  apiUrl: resolved.url,
  apiUrlSource: resolved.source,
  /** What the environment asked for, so the diagnostic can show the override. */
  configuredApiUrl: process.env.EXPO_PUBLIC_API_URL?.trim() ?? null,
  /** Requests that take longer than this are aborted. */
  requestTimeoutMs: 15_000,
  /** How long the reachability probe waits before calling the server down. */
  healthTimeoutMs: 4_000,
} as const;
