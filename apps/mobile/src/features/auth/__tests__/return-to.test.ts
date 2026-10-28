import { safeReturnTo } from '../return-to';

describe('safeReturnTo', () => {
  it('keeps an in-app path', () => {
    expect(safeReturnTo('/showtime/abc123')).toBe('/showtime/abc123');
    expect(safeReturnTo('/movie/verity')).toBe('/movie/verity');
  });

  it('falls back when there is nothing to return to', () => {
    expect(safeReturnTo(undefined)).toBe('/(tabs)');
    expect(safeReturnTo('')).toBe('/(tabs)');
    expect(safeReturnTo(42)).toBe('/(tabs)');
  });

  it('refuses anything that could name another host', () => {
    // Both of these are links out of the app dressed as a path.
    expect(safeReturnTo('//evil.example.com')).toBe('/(tabs)');
    expect(safeReturnTo('https://evil.example.com')).toBe('/(tabs)');
    expect(safeReturnTo('javascript://x')).toBe('/(tabs)');
  });

  it('refuses a relative path, which is not a screen', () => {
    expect(safeReturnTo('showtime/abc')).toBe('/(tabs)');
  });

  it('will not send somebody back to the form they just filled in', () => {
    expect(safeReturnTo('/(auth)/sign-in')).toBe('/(tabs)');
    expect(safeReturnTo('/(auth)/sign-up')).toBe('/(tabs)');
    expect(safeReturnTo('/reset-password')).toBe('/(tabs)');
  });
});
