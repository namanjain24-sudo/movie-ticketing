import { parseUrl, resolveApiUrl } from '../config';

describe('parseUrl', () => {
  it('keeps an explicit port', () => {
    expect(parseUrl('http://192.168.1.5:4000')).toEqual({
      protocol: 'http:',
      host: '192.168.1.5',
      port: '4000',
      path: '',
    });
  });

  it('defaults the port from the scheme', () => {
    expect(parseUrl('https://api.example.com')?.port).toBe('443');
    expect(parseUrl('http://api.example.com')?.port).toBe('80');
  });

  it('keeps a base path but drops a trailing slash', () => {
    expect(parseUrl('https://example.com/api/')?.path).toBe('/api');
  });

  it('rejects anything that is not an http(s) origin', () => {
    expect(parseUrl('ws://example.com')).toBeNull();
    expect(parseUrl('not a url')).toBeNull();
  });
});

describe('resolveApiUrl', () => {
  it('honours a configured remote URL on every platform', () => {
    expect(resolveApiUrl('https://api.example.com', 'ios', '192.168.1.5')).toEqual({
      url: 'https://api.example.com:443',
      source: 'env',
    });
  });

  // The bug this whole module exists for: a phone resolving `localhost` to
  // itself and reporting the server as down.
  it('swaps a configured localhost for the dev server host on a device', () => {
    expect(resolveApiUrl('http://localhost:4000', 'ios', '192.168.1.5')).toEqual({
      url: 'http://192.168.1.5:4000',
      source: 'dev-server',
    });
  });

  it('keeps the configured port when borrowing the dev server host', () => {
    expect(resolveApiUrl('http://127.0.0.1:8787', 'android', '10.7.23.150').url).toBe(
      'http://10.7.23.150:8787',
    );
  });

  it('falls back to the emulator alias on Android with no dev server', () => {
    expect(resolveApiUrl('http://localhost:4000', 'android', null)).toEqual({
      url: 'http://10.0.2.2:4000',
      source: 'android-emulator',
    });
  });

  it('uses localhost on web, where the browser shares the host machine', () => {
    expect(resolveApiUrl('http://localhost:4000', 'web', '192.168.1.5')).toEqual({
      url: 'http://localhost:4000',
      source: 'localhost',
    });
  });

  it('works with nothing configured at all', () => {
    expect(resolveApiUrl(undefined, 'ios', '192.168.1.5').url).toBe('http://192.168.1.5:4000');
    expect(resolveApiUrl(undefined, 'ios', null).url).toBe('http://localhost:4000');
  });
});
