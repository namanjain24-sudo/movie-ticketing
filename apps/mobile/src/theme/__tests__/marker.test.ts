import { markerPath, seedFrom } from '../marker';

const NUMBERS = /-?\d+(\.\d+)?/g;

describe('markerPath', () => {
  it('draws nothing for a box with no area', () => {
    // The first frame, before the heading it measures has been laid out.
    // An empty `d` draws nothing; a malformed one warns on every frame.
    expect(markerPath(0, 10, 1)).toBe('');
    expect(markerPath(100, 0, 1)).toBe('');
    expect(markerPath(Number.NaN, 10, 1)).toBe('');
  });

  it('is the same stroke every time for the same heading', () => {
    // A mark that reshuffled on each render would read as a glitch.
    const seed = seedFrom('Still catchable');
    expect(markerPath(120, 12, seed)).toBe(markerPath(120, 12, seed));
  });

  it('gives two headings two different strokes', () => {
    expect(markerPath(120, 12, seedFrom('Offers'))).not.toBe(
      markerPath(120, 12, seedFrom('Still catchable')),
    );
  });

  it('overshoots the word at both ends, the way a pen does', () => {
    const d = markerPath(100, 12, seedFrom('Offers'));
    const xs = [...d.matchAll(/[MQL] (-?\d+\.\d+)/g)].map((m) => Number(m[1]));

    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(100);
  });

  it('stays inside the box it was given', () => {
    const height = 14;
    const d = markerPath(200, height, seedFrom('Coming soon'));
    const ys = [...d.matchAll(/[MQL] -?\d+\.\d+ (-?\d+\.\d+)/g)].map((m) => Number(m[1]));

    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(height);
  });

  it('never emits a number SVG cannot read', () => {
    for (const title of ['Offers', 'Still catchable', '', 'ज़रूरी', '🎟️']) {
      const d = markerPath(137.4, 11.5, seedFrom(title));
      for (const value of d.match(NUMBERS) ?? []) {
        expect(Number.isFinite(Number(value))).toBe(true);
      }
    }
  });
});

describe('seedFrom', () => {
  it('is stable for the same words', () => {
    expect(seedFrom('Offers')).toBe(seedFrom('Offers'));
  });

  it('separates words that differ', () => {
    expect(seedFrom('Offers')).not.toBe(seedFrom('Offer'));
  });

  it('answers a number SVG arithmetic can use, for anything', () => {
    for (const title of ['', '🎟️ tickets', 'ज़रूरी']) {
      expect(Number.isFinite(seedFrom(title))).toBe(true);
    }
  });
});
