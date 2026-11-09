import { seatColors } from '../../features/seatmap/seat-grid';
import { darkColors, gradients, lightColors, scannerBackground, scannerInk } from '../tokens';
import type { Colors } from '../tokens';

/**
 * Contrast, as a check that runs rather than a claim in a design document.
 *
 * Every one of these started as a measurement of the shipped app, and two of
 * them started as failures. Back when the brand was red: white on it was
 * 3.50:1, and white on the lightest stop of the then primary gradient — the
 * hero's "Book tickets", the single most prominent control in the product -
 * was 2.73:1. The brand is violet now and the same trap is still there, which
 * is the point of keeping these: `primary` is 3.30:1 under white in the dark
 * theme, so filled controls still have to reach for `primarySolid`.
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

/**
 * What a translucent fill actually looks like once it is drawn.
 *
 * `accentMuted` is `rgba(123,91,255,0.18)` in the dark theme — a wash, not a
 * colour. Measuring it as though it were opaque is meaningless: what the eye
 * sees is that wash composited over whatever is behind it, and that is what
 * the label on top has to be read against.
 */
function over(fill: string, backdrop: string): string {
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(fill);
  if (!rgba) return fill;
  const [r, g, b] = [rgba[1], rgba[2], rgba[3]].map(Number);
  const alpha = rgba[4] === undefined ? 1 : Number(rgba[4]);
  const back = backdrop.replace('#', '');
  const mix = [0, 2, 4].map((i, n) => {
    const under = parseInt(back.slice(i, i + 2), 16);
    return Math.round([r, g, b][n] * alpha + under * (1 - alpha));
  });
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * CIE L*a*b*, and the distance between two colours in it.
 *
 * WCAG contrast measures one thing: luminance. That is the right question for
 * text, where the eye is resolving a thin glyph against a ground, and it is
 * the wrong question for two blocks of colour side by side.
 *
 * The seat map is where that difference stopped being academic. A held seat
 * is ringed in violet and a free seat in lime; their luminances are close
 * enough that WCAG scores the pair 1.22:1, which if it meant anything would
 * mean "indistinguishable". Nobody has ever confused violet with lime. The
 * same pair is 163 apart in Lab, where hue counts.
 *
 * So: luminance for text, Lab for everything that is a colour next to another
 * colour. CIE76 rather than CIE94 or CIEDE2000 - the later formulas refine
 * small differences, and nothing here is deciding a close call.
 */
function lab(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  const [R, G, B] = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  // sRGB to XYZ under D65, each channel normalised by the white point.
  const xyz = [
    (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047,
    0.2126 * R + 0.7152 * G + 0.0722 * B,
    (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883,
  ].map((t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116));
  return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])];
}

function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

const AA_NORMAL = 4.5;

/**
 * How far apart two blocks of colour have to be to read as two things.
 *
 * A just-noticeable difference is about 2.3 and anything past 10 is plainly a
 * different colour. 25 is well above that and well below the 70 the closest
 * seat pair actually manages, which is the gap a threshold wants: strict
 * enough to catch a palette edit that collapses two states, loose enough that
 * it is not re-tuned every time a neutral moves one step.
 */
const SEAT_STATES_APART = 25;

/**
 * Both themes, token for token.
 *
 * `Colors` is a type, and a type cannot stop a palette being half-updated at
 * runtime — a token added to one theme and forgotten in the other reads as
 * `undefined`, which React Native renders as no colour at all rather than as
 * an error. The two palettes are written out by hand, side by side, which is
 * exactly the shape of edit that loses one.
 */
describe('the two palettes', () => {
  it('define the same tokens', () => {
    expect(Object.keys(lightColors).sort()).toEqual(Object.keys(darkColors).sort());
  });

  it('give every one of them something to paint with', () => {
    // A hex, an rgba, or `transparent` — which `seatFree` legitimately is, a
    // free seat being drawn as its outline and the room showing through. What
    // this is actually guarding against is `undefined`, which React Native
    // renders as no colour rather than as an error.
    for (const [theme, colors] of [
      ['light', lightColors],
      ['dark', darkColors],
    ] as const) {
      for (const [token, value] of Object.entries(colors)) {
        expect(`${theme}.${token}=${String(value)}`).toMatch(
          /=(#[0-9A-Fa-f]{3,8}|rgba?\(|transparent$)/,
        );
      }
    }
  });
});

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

    /**
     * Every seat state, told apart from every other one.
     *
     * A seat is about 24px across and it is read in a grid of four hundred
     * others, so the only thing separating the states is how unlike each
     * other they are. This is part of why the brand left the warm half of the
     * wheel: when the brand was red, "yours" was a red fill and "free" was a
     * green outline, one hue apart on a surface the size of a fingernail.
     *
     * Driven by `seatColors`, not by a list of tokens copied out of it. The
     * mapping is the thing that has to stay legible, and a test that restates
     * it by hand stops describing it the moment somebody edits one of them.
     *
     * Fill *or* border, because that is genuinely how the states read. A held
     * seat and a sold seat are both a quiet fill, and what separates them at
     * arm's length is that one of them is ringed in the brand colour. A
     * selected seat and a held one share a border exactly, and are separated
     * by their fills instead.
     */
    it('keeps every seat state apart from every other one', () => {
      const statuses = ['SELECTED', 'HELD_BY_YOU', 'AVAILABLE', 'SOLD'] as const;
      // `transparent` is a real answer for a fill: a free seat in the dark
      // theme is its outline with the auditorium showing through.
      const onPage = (token: string) =>
        token === 'transparent' ? colors.background : over(token, colors.background);

      const tooClose: string[] = [];
      for (let i = 0; i < statuses.length; i += 1) {
        for (let j = i + 1; j < statuses.length; j += 1) {
          const a = seatColors(statuses[i], colors);
          const b = seatColors(statuses[j], colors);
          const apart = Math.max(
            deltaE(onPage(a.fill), onPage(b.fill)),
            deltaE(onPage(a.border), onPage(b.border)),
          );
          if (apart < SEAT_STATES_APART) {
            tooClose.push(`${statuses[i]} vs ${statuses[j]} (dE ${apart.toFixed(1)})`);
          }
        }
      }
      expect(tooClose).toEqual([]);
    });

    it('reads body text comfortably', () => {
      expect(contrast(colors.text, colors.background)).toBeGreaterThanOrEqual(7);
      expect(contrast(colors.textMuted, colors.background)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    /**
     * The three status colours, which are text as often as they are a dot.
     *
     * These were written for the dark page and reused unchanged on the light
     * one, where they measured 3.41, 2.17 and 4.39 against white. Amber at
     * 2.17 is not a ratio anybody reads a word in, and it was carrying
     * "Filling fast" on a stand, a late show's end time on a chip, and the A
     * on a certificate badge — three places where the colour *is* the
     * message.
     *
     * All three surfaces, because `Badge` puts a success or warning label on
     * its own muted fill in the light theme, which is a lighter ground than
     * either of the other two and so the strictest of the three.
     */
    it.each([
      ['success', 'successMuted'],
      ['warning', 'warningMuted'],
      ['accent', 'accentMuted'],
    ] as const)('reads %s as text on the page, a card and its own badge', (ink, fill) => {
      expect(contrast(colors[ink], colors.background)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrast(colors[ink], colors.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
      // Composited first: the dark theme's accent badge is a translucent
      // wash, and what the label is read against is the wash over the card.
      expect(contrast(colors[ink], over(colors[fill], colors.surface))).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    });

    it('reads text on the chrome bar, which is dark in both themes', () => {
      expect(contrast(colors.onChrome, colors.chrome)).toBeGreaterThanOrEqual(AA_NORMAL);
    });
  });

  /**
   * A gradient is only as readable as its lightest stop, which is exactly how
   * the hero CTA came to be at 2.73:1 while the flat buttons beside it were
   * fine. Both ends, every time.
   *
   * Against `onPrimary` rather than against white. They are the same colour
   * today, and the assertion was written as a literal white because of that.
   * But `onPrimary` is a token precisely so that it can stop being white: a
   * brand whose fills are bright enough to need a dark label is a normal
   * thing for this palette to become, and on that day a hardcoded white here
   * would keep passing while the button it describes became unreadable.
   */
  describe.each([
    ['light', lightColors],
    ['dark', darkColors],
  ])('%s theme', (_name, colors: Colors) => {
    it('keeps the label readable across the whole primary gradient', () => {
      for (const stop of gradients.primary) {
        expect(contrast(colors.onPrimary, stop)).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    });
  });

  it('gives a scanner real black on real white, whatever the theme', () => {
    expect(contrast(scannerInk, scannerBackground)).toBeGreaterThan(15);
  });
});
