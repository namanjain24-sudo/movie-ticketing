import type { TextStyle } from 'react-native';

/**
 * Every colour, space and radius in the app comes from here. Components never
 * hard-code a hex value, so re-skinning the product is a one-file change.
 */

const palette = {
  /**
   * Signature accent. Marks the primary action and nothing else.
   *
   * `red500` is the brand, and it is what you see as a stroke, an icon, a tab
   * tint or a line of text on a dark background — 5.15:1 against `ink900`,
   * comfortably readable.
   *
   * It is not what you see *behind white text*. White on `red500` is 3.50:1,
   * and WCAG AA wants 4.5:1 for anything that is not large text — which the
   * button label at 17px bold is not, and the seat number at 10px very much
   * is not. `red600` is 4.71:1 with white and `red700` is 6.38:1, so filled
   * controls use those and the brand colour keeps every other job. See
   * `primarySolid` below.
   */
  red700: '#B81E3D',
  red600: '#D92E50',
  red500: '#F84464',
  red400: '#FF6B84',
  red100: '#FFE4E9',

  // Chrome. Dark in both themes: it anchors the app and lets posters read
  // against a neutral rather than against the page.
  chrome900: '#16161C',
  chrome800: '#22222C',
  chrome700: '#333545',

  ink900: '#101015',
  ink850: '#16161D',
  ink800: '#1B1B24',
  ink700: '#24242E',
  ink600: '#333340',
  ink500: '#6B6B76',
  ink400: '#9A9AA6',
  ink300: '#C9C9D2',
  ink200: '#E4E4EA',
  ink100: '#EFEFF3',
  ink50: '#F5F5F7',
  white: '#FFFFFF',

  green500: '#1EA043',
  green100: '#DCF5E3',
  amber500: '#E8A317',
  amber100: '#FDF0D5',

  // Accent pair. The app's one gesture towards the future is light: a cinema
  // is a dark room with a projector in it, so the accents behave like emitted
  // light rather than like paint — they glow, they gradient, and they only
  // ever appear on something that is doing work.
  violet500: '#7B5BFF',
  violet400: '#9C86FF',
  cyan400: '#35D6E8',
  gold400: '#FFC24B',
} as const;

export type ColorName =
  | 'background'
  | 'surface'
  | 'surfaceMuted'
  | 'surfaceSunken'
  | 'border'
  | 'borderStrong'
  | 'text'
  | 'textMuted'
  | 'textInverse'
  | 'primary'
  // A fill that carries white text, as opposed to `primary`, which is a
  // brand colour for strokes, icons and text. White on `primary` is 3.50:1
  // and fails WCAG AA at the sizes this app actually uses.
  | 'primarySolid'
  | 'primarySolidPressed'
  | 'primaryPressed'
  | 'primaryMuted'
  | 'onPrimary'
  // The top bar is its own small world, dark in both themes.
  | 'chrome'
  | 'onChrome'
  | 'onChromeMuted'
  /** An inactive pill or control sitting on the chrome bar itself — never a
   * page surface, so it doesn't flip with light/dark like `surfaceMuted`. */
  | 'chromeSurface'
  | 'success'
  | 'successMuted'
  | 'warning'
  | 'warningMuted'
  | 'danger'
  | 'dangerMuted'
  // A poster or still is never theme-tinted, so text laid over one needs a
  // colour that doesn't flip with light/dark — same idea as `onChrome`, for
  // photos instead of the chrome bar.
  | 'onImage'
  | 'onImageMuted'
  | 'onImageScrim'
  | 'onImageSurface'
  // Seat map, where a seat's meaning must survive being 24px wide.
  | 'seatFree'
  | 'seatFreeBorder'
  | 'seatGone'
  | 'scrim'
  // Secondary accent, for the things that are live rather than pressable:
  // a rating, a distance, a seat that just freed up.
  | 'accent'
  | 'accentMuted'
  // Glass: a translucent panel over content, with a hairline to give it an
  // edge. Both carry alpha, so they are the two colours in the system that
  // must never be used as a solid background.
  | 'glass'
  | 'glassBorder';

export type Colors = Record<ColorName, string>;

export const lightColors: Colors = {
  background: palette.ink50,
  surface: palette.white,
  surfaceMuted: palette.ink100,
  surfaceSunken: palette.ink200,
  border: palette.ink200,
  borderStrong: palette.ink300,

  text: palette.ink900,
  textMuted: palette.ink500,
  textInverse: palette.white,

  primary: palette.red500,
  primarySolid: palette.red600,
  primarySolidPressed: palette.red700,
  primaryPressed: palette.red600,
  primaryMuted: palette.red100,
  onPrimary: palette.white,

  chrome: palette.chrome700,
  onChrome: palette.white,
  onChromeMuted: palette.ink300,
  chromeSurface: 'rgba(255,255,255,0.14)',

  success: palette.green500,
  successMuted: palette.green100,
  warning: palette.amber500,
  warningMuted: palette.amber100,
  danger: palette.red600,
  dangerMuted: palette.red100,

  seatFree: palette.white,
  seatFreeBorder: palette.green500,
  // ink300, not ink200, for the same reason dark mode uses ink600 rather than
  // ink700: a sold block has to read as "blocked" against the page behind it,
  // and ink200 sat at 1.16:1 there — a sold-out house looked like an empty
  // one. This lands at 1.51:1, within a hair of dark mode's 1.53:1, so the
  // two themes say "taken" with the same emphasis.
  seatGone: palette.ink300,
  scrim: 'rgba(16,16,21,0.55)',

  accent: palette.violet500,
  accentMuted: '#EFECFF',
  glass: 'rgba(255,255,255,0.72)',
  glassBorder: 'rgba(16,16,21,0.08)',

  onImage: palette.white,
  onImageMuted: 'rgba(255,255,255,0.72)',
  onImageScrim: 'rgba(0,0,0,0.55)',
  onImageSurface: palette.chrome900,
};

export const darkColors: Colors = {
  background: palette.ink900,
  surface: palette.ink800,
  surfaceMuted: palette.ink700,
  surfaceSunken: palette.ink850,
  border: palette.ink700,
  borderStrong: palette.ink600,

  text: palette.ink50,
  textMuted: palette.ink400,
  textInverse: palette.ink900,

  primary: palette.red500,
  primarySolid: palette.red600,
  primarySolidPressed: palette.red700,
  primaryPressed: palette.red400,
  // A translucent red tint rather than ink700: that flat grey is also
  // `seatGone`'s fill, and a seat you are holding must never read as a seat
  // that is gone. Mirrors `accentMuted`'s own dark-mode pattern below.
  primaryMuted: 'rgba(248,68,100,0.18)',
  onPrimary: palette.white,

  chrome: palette.chrome900,
  onChrome: palette.white,
  onChromeMuted: palette.ink400,
  chromeSurface: 'rgba(255,255,255,0.14)',

  success: palette.green500,
  successMuted: palette.ink700,
  warning: palette.amber500,
  warningMuted: palette.ink700,
  danger: palette.red400,
  dangerMuted: palette.ink700,

  seatFree: 'transparent',
  seatFreeBorder: palette.green500,
  // ink600, not ink700: a sold-out block has to read as "blocked" against the
  // ink900 screen behind it, and ink700 sat at under 1.3:1 contrast there.
  seatGone: palette.ink600,
  scrim: 'rgba(0,0,0,0.6)',

  accent: palette.violet400,
  accentMuted: 'rgba(123,91,255,0.18)',
  glass: 'rgba(28,28,38,0.72)',
  glassBorder: 'rgba(255,255,255,0.10)',

  onImage: palette.white,
  onImageMuted: 'rgba(255,255,255,0.72)',
  onImageScrim: 'rgba(0,0,0,0.55)',
  onImageSurface: palette.chrome900,
};

/**
 * A QR code needs real black-on-white contrast to scan reliably, independent
 * of theme — dark mode does not get a dark quiet zone. These are the only two
 * colours in the app that deliberately do not come from `Colors`.
 */
export const scannerBackground = palette.white;
export const scannerInk = palette.ink900;

/**
 * Gradients, as the two-stop arrays every gradient library wants.
 *
 * Two stops, not five. A gradient with a stop for every colour in the palette
 * is a screensaver; these exist to give a flat rectangle a direction and a
 * light source, and two stops is all that takes.
 */
export const gradients = {
  /**
   * The commit action, and nothing else.
   *
   * It used to run `red400` → `red600`, and white on `red400` is 2.73:1 — the
   * worst contrast in the app, on the most prominent button in it, the hero's
   * "Book tickets". A gradient is only as readable as its lightest stop, so
   * both ends now sit in the half of the brand that white survives on:
   * `red600` at 4.71:1 and `red700` at 6.38:1. It still travels, it still has
   * a light source, and the label can be read in daylight.
   */
  primary: [palette.red600, palette.red700] as const,
  /** Accent surfaces: rating pills, live badges, the map's own chrome. */
  accent: ['#9C86FF', '#5B3BE0'] as const,
  /** Behind a poster, so artwork fades into the page rather than stopping. */
  night: ['rgba(16,16,21,0)', 'rgba(16,16,21,0.94)'] as const,
  /** The auditorium screen's light, thrown up the seat map. */
  projector: ['rgba(53,214,232,0.34)', 'rgba(53,214,232,0)'] as const,
  /** A won ticket. Used once, on the confirmation. */
  gold: ['#FFD98A', '#E8A317'] as const,
} as const;

export type GradientName = keyof typeof gradients;

/** A 4pt scale. Anything not on it is a mistake, not a design decision. */
export const spacing = {
  /** Only for a caption tight under its own title — never between two rows. */
  '2xs': 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999,
} as const;

/**
 * Steps are deliberately far apart. On a phone held at arm's length a two-point
 * difference is not a hierarchy, it is a rendering artefact.
 */
export const typography = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.6 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.4 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  /** Section eyebrows and legend text. Wide tracking earns the small size. */
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.8 },
} as const;

export type TypographyVariant = keyof typeof typography;

/**
 * Prices and countdowns. Tabular figures stop a total from jittering as the
 * digits change, which is the difference between a timer and a slot machine.
 */
export const NUMERIC: TextStyle = { fontVariant: ['tabular-nums'] };

/** Minimum touch target. Below this, buttons fail accessibility review. */
export const HIT_SIZE = 44;

/**
 * Elevation for cards that sit above the page. Offset plus blur — a shadow
 * without an offset is a halo, not depth.
 */
export const elevation = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  raised: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  /**
   * Coloured light rather than shadow, for an element that is meant to read as
   * emitting. Used on the commit button and the live-availability pill, and
   * nowhere else — a glow on every card is a blur on every card.
   */
  glow: {
    shadowColor: palette.red500,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.42,
    shadowRadius: 18,
    elevation: 10,
  },
  accentGlow: {
    shadowColor: palette.violet500,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

/**
 * Motion.
 *
 * The app had springs and timings in it before it had a scale for them:
 * durations of 90, 110, 160, 180 and 220ms, and springs at damping 10, 12 and
 * 14 against stiffness 160, 180, 220 and 320. Nobody chose four stiffnesses.
 * They accumulated, one screen at a time, and the difference between 160 and
 * 180 is not a decision a user can perceive — it is the same drift `spacing`
 * exists to stop, so this is the same answer.
 *
 * Named by the job, not by the number, because the number is what drifts.
 */
export const motion = {
  /**
   * `fast` answers a finger that is already there: by the time a press-in
   * animation plays, the thumb has arrived and the only job left is to admit
   * it. `base` is the default for anything appearing or moving on its own.
   * `slow` is for something large enough that its travel is informative —
   * a sheet, a screen, a summary bar rising into place.
   *
   * There is deliberately no step between `base` and `slow`. Two durations
   * 40ms apart read as one duration implemented twice.
   */
  duration: {
    fast: 90,
    base: 160,
    slow: 220,
    /**
     * Ambient, self-running motion with no input waiting on it: the splash
     * mark drawing itself, a shimmer crossing a skeleton. Anything on this
     * tier must be interruptible — it is the one tier long enough that a user
     * can arrive mid-animation.
     */
    ambient: 1100,
  },

  /**
   * Three springs, each with a reason to exist.
   *
   * `press` is the release overshoot on a tapped surface — stiff and tightly
   * damped, so it reads as a physical rebound rather than a wobble.
   * `settle` is for something arriving at a resting place it chose: the seat
   * that grows and settles, a sheet reaching its detent.
   * `enter` is softer and slower, for an element appearing from nothing,
   * where a little overshoot reads as arrival rather than as a glitch.
   */
  spring: {
    press: { damping: 14, stiffness: 320 },
    settle: { damping: 14, stiffness: 220 },
    enter: { damping: 12, stiffness: 160 },
  },

  /**
   * How far a pressable dips under the thumb. One value, because a card and a
   * button that answer a press differently read as two apps.
   */
  pressScale: 0.035,
} as const;

export type MotionDuration = keyof typeof motion.duration;
export type MotionSpring = keyof typeof motion.spring;
