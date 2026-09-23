import type { TextStyle } from 'react-native';

/**
 * Every colour, space and radius in the app comes from here. Components never
 * hard-code a hex value, so re-skinning the product is a one-file change.
 */

const palette = {
  // Signature accent. Marks the primary action and nothing else.
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
  | 'primaryPressed'
  | 'primaryMuted'
  | 'onPrimary'
  // The top bar is its own small world, dark in both themes.
  | 'chrome'
  | 'onChrome'
  | 'onChromeMuted'
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
  primaryPressed: palette.red600,
  primaryMuted: palette.red100,
  onPrimary: palette.white,

  chrome: palette.chrome700,
  onChrome: palette.white,
  onChromeMuted: palette.ink300,

  success: palette.green500,
  successMuted: palette.green100,
  warning: palette.amber500,
  warningMuted: palette.amber100,
  danger: palette.red600,
  dangerMuted: palette.red100,

  seatFree: palette.white,
  seatFreeBorder: palette.green500,
  seatGone: palette.ink200,
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
  primaryPressed: palette.red400,
  primaryMuted: palette.ink700,
  onPrimary: palette.white,

  chrome: palette.chrome900,
  onChrome: palette.white,
  onChromeMuted: palette.ink400,

  success: palette.green500,
  successMuted: palette.ink700,
  warning: palette.amber500,
  warningMuted: palette.ink700,
  danger: palette.red400,
  dangerMuted: palette.ink700,

  seatFree: 'transparent',
  seatFreeBorder: palette.green500,
  seatGone: palette.ink700,
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
  /** The commit action, and nothing else. */
  primary: ['#FF6B84', '#D92E50'] as const,
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
