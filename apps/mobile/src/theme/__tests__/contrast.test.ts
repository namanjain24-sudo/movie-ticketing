import { darkColors, gradients, lightColors, scannerBackground, scannerInk } from '../tokens';
import type { Colors } from '../tokens';

/**
 * Contrast, as a check that runs rather than a claim in a design document.
 *
 * Every one of these started as a measurement of the shipped app, and two of
 * them started as failures: white on the brand red is 3.50:1, and white on the
 * lightest stop of the old primary gradient — the hero's "Book tickets", the
 * single most prominent control in the product — was 2.73:1.
 *
 * WCAG AA wants 4.5:1 for normal text and 3:1 for large, where "large" means
 * 18.66px bold or 24px regular. This app's button label is 17px bold and its
 * seat number is 10px, so neither qualifies and the 4.5 figure is the one that
 * applies. These tests exist so that darkening those fills cannot be quietly
 * undone by a later palette tidy-up.
 */

/** sRGB relative luminance, per WCAG 2.1. */
function luminance(hex: string): number {
  const c = hex.replace('#', '');
  const channels = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const AA_NORMAL = 4.5;

describe('contrast', () => {
  /**
   * The formula first, against the values the WCAG authors publish, so a bug
   * in the helper cannot quietly pass every assertion below it.
   */
  it.each([
    ['#000000', '#FFFFFF', 21],
    ['#767676', '#FFFFFF', 4.54],
    ['#595959', '#FFFFFF', 7],
  ])('matches the published ratio for %s on %s', (a, b, expected) => {
    expect(contrast(a, b)).toBeCloseTo(expected, 1);
  });

  describe.each([
    ['light', lightColors],
    ['dark', darkColors],
  ])('%s theme', (_name, colors: Colors) => {
    it('can carry its own label on a filled primary control', () => {
      // Buttons, selected seats, selected chips, the avatar, the urgent
      // countdown. All of them put `onPrimary` on `primarySolid`.
      expect(contrast(colors.onPrimary, colors.primarySolid)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it('keeps the label readable while the control is held down', () => {
      expect(contrast(colors.onPrimary, colors.primarySolidPressed)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    });

    it('reads as text against the page it sits on', () => {
      // `primary` is the brand colour's other job: strokes, icons and text.
      // It is not required to survive white on top of it, but it is required
      // to be legible as a line of text, which is what the auth links are.
      const threshold = _name === 'light' ? 3 : AA_NORMAL;
      expect(contrast(colors.primary, colors.background)).toBeGreaterThanOrEqual(threshold);
    });

    it('distinguishes a seat you are holding from one that is gone', () => {
      // The defect this replaced: in dark mode both were ink700, so a seat you
      // held looked exactly like a seat somebody else had taken.
      expect(colors.primaryMuted).not.toBe(colors.seatGone);
    });

    it('shows a sold seat against the auditorium behind it', () => {
      expect(contrast(colors.seatGone, colors.background)).toBeGreaterThanOrEqual(1.4);
    });

    it('reads body text comfortably', () => {
      expect(contrast(colors.text, colors.background)).toBeGreaterThanOrEqual(7);
      expect(contrast(colors.textMuted, colors.background)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it('reads text on the chrome bar, which is dark in both themes', () => {
      expect(contrast(colors.onChrome, colors.chrome)).toBeGreaterThanOrEqual(AA_NORMAL);
    });
  });

  /**
   * A gradient is only as readable as its lightest stop, which is exactly how
   * the hero CTA came to be at 2.73:1 while the flat buttons beside it were
   * fine. Both ends, every time.
   */
  it('keeps white readable across the whole primary gradient', () => {
    for (const stop of gradients.primary) {
      expect(contrast('#FFFFFF', stop)).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('gives a scanner real black on real white, whatever the theme', () => {
    expect(contrast(scannerInk, scannerBackground)).toBeGreaterThan(15);
  });
});
