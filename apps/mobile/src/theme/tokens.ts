import type { TextStyle } from 'react-native';

/**
 * Every colour, space and radius in the app comes from here. Components never
 * hard-code a hex value, so re-skinning the product is a one-file change.
 *
 * The identity is a dark room with a lit screen in it.
 *
 * The product used to be red, a few degrees off the colour every other
 * ticketing app in the market already owns, and the red cost it twice. Once in
 * recognition, because a red cinema app is wallpaper. Once in the seat map,
 * where the brand had to mean "the seat you picked" while green meant "free"
 * and a muted grey meant "gone" - three states, two of which were fighting
 * over the warm half of the wheel.
 *
 * So the brand moved to violet and the accent to lime. Violet is the thing you
 * press. Lime is the thing that is alive: a show filling up, a reward landing,
 * the projector's own light. Neither one is green, amber or red, which leaves
 * all three free to go back to meaning only what they say.
 */

const palette = {
  /**
   * The brand, as a ramp rather than a colour, because one violet cannot do
   * every job a brand is asked to do.
   *
   * `v500` is the brand at full voice: a stroke, an icon, a tab tint, a line
   * of link text on a dark page. `v600` and `v700` are the half that white
   * survives on (6.68:1 and 8.17:1), so every filled control is drawn from
   * those and the bright end never has to carry a 17px label.
   *
   * This is the same split the red palette arrived at the hard way. It is kept
   * because the reason for it has not changed: a brand colour chosen to look
   * good as a stroke is almost never dark enough to sit behind white text.
   */
  v800: '#3A1FB8',
  v700: '#4A26D9',
  v600: '#5B31F0',
  v500: '#6C4DFF',
  v400: '#9079FF',
  v300: '#B4A5FF',
  v100: '#EAE4FF',

  /**
   * The accent, and the only one. Acid lime.
   *
   * It reads as emitted rather than painted, which is the whole reason it is
   * here: a cinema is a dark room, and the things worth looking at in it are
   * the things giving off light. It marks what is live and what has just been
   * won, and nothing else. A lime that appears on every card is a lime that
   * means nothing.
   *
   * `l400` is for the dark page, where it is a beacon at 15.58:1. On a white
   * page the same colour is 1.3:1, which is not a colour you can read a word
   * in, so the light theme uses `l600` at 5.08:1 instead. Same accent, two
   * weights, exactly as the status colours do below.
   */
  l700: '#3F5600',
  l600: '#54730A',
  l500: '#8FD400',
  l400: '#B8FF3C',
  l300: '#D2FF7D',
  l100: '#EEFFCB',

  /**
   * Neutrals, shifted a few points cool.
   *
   * A true grey next to a violet brand reads as slightly yellow, which makes
   * the whole app look dusty. These lean blue just enough to sit under the
   * brand without anyone noticing the correction. Never `#000000`: pure black
   * has no shadow to give, so depth stops working the moment you need it.
   */
  n950: '#0B0B10',
  n900: '#111118',
  n850: '#16161F',
  n800: '#1C1C27',
  n700: '#262633',
  n600: '#353545',
  n500: '#6E6E80',
  n450: '#85859A',
  n400: '#9E9EB2',
  n300: '#C7C7D4',
  n200: '#E3E3EB',
  n100: '#EFEFF4',
  n50: '#F6F6F9',
  white: '#FFFFFF',

  /**
   * Status, in two weights each, for the same reason the accent has two.
   *
   * The bright weight is written for a dark page and the dark weight for a
   * white one. Shipping one weight for both is how the previous palette ended
   * up with an amber at 2.17:1 carrying the words "Filling fast".
   */
  em600: '#0F7A3D',
  em500: '#19B85C',
  em100: '#D7F7E3',

  am700: '#8A5200',
  am500: '#F0A91B',
  am100: '#FDF0D2',

  /**
   * Danger is a rose, not the old brand red, and now that the brand is violet
   * it can be: there is nothing left for it to be confused with. Keeping it
   * clearly red matters more than keeping it on-brand, because it is the
   * colour that says a payment failed.
   */
  ro600: '#C9254B',
  ro500: '#F2415F',
  ro400: '#FF7088',
  ro100: '#FFE2E8',

  /** Celebration. One moment in the product owns this: a ticket you now hold. */
  gold400: '#FFC24B',
  gold300: '#FFD98A',
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
  // brand colour for strokes, icons and text. The bright end of the violet
  // ramp is 3.1:1 under white and fails WCAG AA at the sizes this app uses.
  | 'primarySolid'
  | 'primarySolidPressed'
  | 'primaryPressed'
  | 'primaryMuted'
  | 'onPrimary'
  // The top bar is its own small world, dark in both themes.
  | 'chrome'
  | 'onChrome'
  | 'onChromeMuted'
  /** An inactive pill or control sitting on the chrome bar itself - never a
   * page surface, so it doesn't flip with light/dark like `surfaceMuted`. */
  | 'chromeSurface'
  | 'success'
  | 'successMuted'
  | 'warning'
  | 'warningMuted'
  | 'danger'
  | 'dangerMuted'
  // A poster or still is never theme-tinted, so text laid over one needs a
  // colour that doesn't flip with light/dark - same idea as `onChrome`, for
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
  // a rating, a distance, a seat that just freed up, a reward.
  | 'accent'
  | 'accentMuted'
  // Glass: a translucent panel over content, with a hairline to give it an
  // edge. Both carry alpha, so they are the two colours in the system that
  // must never be used as a solid background.
  | 'glass'
  | 'glassBorder';

export type Colors = Record<ColorName, string>;

export const lightColors: Colors = {
  background: palette.n50,
  surface: palette.white,
  surfaceMuted: palette.n100,
  surfaceSunken: palette.n200,
  border: palette.n200,
  borderStrong: palette.n300,

  text: palette.n950,
  textMuted: palette.n500,
  textInverse: palette.white,

  primary: palette.v600,
  primarySolid: palette.v600,
  primarySolidPressed: palette.v700,
  primaryPressed: palette.v700,
  primaryMuted: palette.v100,
  onPrimary: palette.white,

  chrome: palette.n900,
  onChrome: palette.white,
  onChromeMuted: palette.n300,
  chromeSurface: 'rgba(255,255,255,0.14)',

  success: palette.em600,
  successMuted: palette.em100,
  warning: palette.am700,
  warningMuted: palette.am100,
  danger: palette.ro600,
  dangerMuted: palette.ro100,

  seatFree: palette.white,
  /**
   * A free seat is an outline, and the outline is the accent rather than a
   * green: green is now only ever a confirmation, and a seat nobody has
   * bought yet has confirmed nothing. It also keeps the three seat states on
   * three different hues, which is what makes them legible at 24px.
   */
  seatFreeBorder: palette.l600,
  // n300, not n200, for the same reason dark mode uses n600 rather than n700:
  // a sold block has to read as "blocked" against the page behind it, and the
  // lighter step sat near 1.16:1 there, so a sold-out house looked like an
  // empty one. This lands at 1.55:1, within a hair of dark mode's 1.56:1, so
  // the two themes say "taken" with the same emphasis.
  seatGone: palette.n300,
  scrim: 'rgba(11,11,16,0.55)',

  accent: palette.l600,
  accentMuted: palette.l100,
  glass: 'rgba(255,255,255,0.72)',
  glassBorder: 'rgba(11,11,16,0.08)',

  onImage: palette.white,
  onImageMuted: 'rgba(255,255,255,0.72)',
  onImageScrim: 'rgba(0,0,0,0.55)',
  onImageSurface: palette.n950,
};

export const darkColors: Colors = {
  background: palette.n900,
  surface: palette.n800,
  surfaceMuted: palette.n700,
  surfaceSunken: palette.n850,
  border: palette.n700,
  borderStrong: palette.n600,

  text: palette.n50,
  textMuted: palette.n400,
  textInverse: palette.n950,

  primary: palette.v400,
  primarySolid: palette.v600,
  primarySolidPressed: palette.v700,
  primaryPressed: palette.v500,
  // A translucent violet tint rather than a flat grey: the flat grey is also
  // `seatGone`'s fill, and a seat you are holding must never read as a seat
  // that is gone. Mirrors `accentMuted`'s own dark-mode pattern below.
  primaryMuted: 'rgba(108,77,255,0.22)',
  onPrimary: palette.white,

  chrome: palette.n950,
  onChrome: palette.white,
  onChromeMuted: palette.n400,
  chromeSurface: 'rgba(255,255,255,0.14)',

  success: palette.em500,
  successMuted: palette.n700,
  warning: palette.am500,
  warningMuted: palette.n700,
  danger: palette.ro400,
  dangerMuted: palette.n700,

  seatFree: 'transparent',
  seatFreeBorder: palette.l500,
  // n600, not n700: a sold-out block has to read as "blocked" against the
  // n900 screen behind it, and n700 sat at under 1.3:1 contrast there.
  seatGone: palette.n600,
  scrim: 'rgba(0,0,0,0.6)',

  accent: palette.l400,
  accentMuted: 'rgba(184,255,60,0.18)',
  glass: 'rgba(28,28,39,0.72)',
  glassBorder: 'rgba(255,255,255,0.10)',

  onImage: palette.white,
  onImageMuted: 'rgba(255,255,255,0.72)',
  onImageScrim: 'rgba(0,0,0,0.55)',
  onImageSurface: palette.n950,
};

/**
 * A QR code needs real black-on-white contrast to scan reliably, independent
 * of theme - dark mode does not get a dark quiet zone. These are the only two
 * colours in the app that deliberately do not come from `Colors`.
 */
export const scannerBackground = palette.white;
export const scannerInk = palette.n950;

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
   * Both stops sit in the half of the brand that white survives on: `v600` at
   * 6.68:1 and `v800` at 10.15:1. A gradient is only as readable as its
   * lightest stop, which is how the old hero CTA came to be at 2.73:1 while
   * the flat buttons beside it were fine.
   */
  primary: [palette.v600, palette.v800] as const,
  /** Accent surfaces: live pills, rating chips, the "filling fast" stand. */
  accent: [palette.l400, palette.l500] as const,
  /** Behind a poster, so artwork fades into the page rather than stopping. */
  night: ['rgba(17,17,24,0)', 'rgba(17,17,24,0.94)'] as const,
  /** The auditorium screen's light, thrown up the seat map. */
  projector: ['rgba(184,255,60,0.30)', 'rgba(184,255,60,0)'] as const,
  /** A won ticket. Used once, on the confirmation. */
  gold: [palette.gold300, palette.gold400] as const,
  /**
   * The unscratched face of a reward card, which has to look like it is
   * hiding something. Violet into near-black rather than the brand gradient:
   * this is the one surface in the app that is deliberately not a button, and
   * it should not be wearing a button's clothes.
   */
  reward: [palette.v500, palette.n950] as const,
} as const;

export type GradientName = keyof typeof gradients;

/** A 4pt scale. Anything not on it is a mistake, not a design decision. */
export const spacing = {
  /** Only for a caption tight under its own title - never between two rows. */
  '2xs': 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

/**
 * Corners, one step softer than they were.
 *
 * The old scale topped out at 20 and started at 6, which is a 2015 phone app.
 * Everything a sixteen-year-old uses daily is rounder than that, and a 6pt
 * corner on a 44pt control reads as an accident rather than a decision. The
 * jump from `xl` to `2xl` exists for the one case that wants to look like a
 * card you could pick up: a poster tile, a reward, a bottom sheet.
 */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 28,
  full: 999,
} as const;

/**
 * The typeface, named one face per weight.
 *
 * React Native does not synthesise a weight from a family. Ask Android for
 * "Plus Jakarta Sans" at weight 800 and it renders the regular file, because
 * the only thing it matches on is the family name it was registered under. So
 * each weight is registered as its own family and named here explicitly, and
 * the `fontWeight` on each variant below is kept in agreement with the face
 * rather than left to do the choosing.
 *
 * The app shipped in the system font until now, which is a legible, careful,
 * completely anonymous choice: San Francisco on one phone and Roboto on the
 * other, so the product had no voice of its own on either. Plus Jakarta Sans
 * is a geometric grotesque with a heavy end that holds up at `displayLg`,
 * which is the size that has to carry the page.
 *
 * `assets/fonts` holds the four files and the licence they ship under. The
 * `require` map that registers them lives in `./fonts`, so that importing a
 * colour does not pull four binaries into a unit test.
 */
export const FONT_FAMILY = {
  regular: 'PlusJakartaSans-Regular',
  semibold: 'PlusJakartaSans-SemiBold',
  bold: 'PlusJakartaSans-Bold',
  extrabold: 'PlusJakartaSans-ExtraBold',
} as const;

/**
 * Steps are deliberately far apart. On a phone held at arm's length a two-point
 * difference is not a hierarchy, it is a rendering artefact.
 *
 * `displayLg` is new and it is the loud one: a screen title meant to be the
 * first thing read, and the reason the page feels like it belongs to this
 * decade. It is not a default. Exactly one block per screen may use it, and
 * most screens do not get one at all.
 */
export const typography = {
  displayLg: {
    fontFamily: FONT_FAMILY.extrabold,
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  display: {
    fontFamily: FONT_FAMILY.extrabold,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.9,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  heading: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  body: { fontFamily: FONT_FAMILY.regular, fontSize: 15, lineHeight: 22, fontWeight: '400' },
  label: { fontFamily: FONT_FAMILY.semibold, fontSize: 14, lineHeight: 18, fontWeight: '600' },
  caption: { fontFamily: FONT_FAMILY.semibold, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  /** Section eyebrows and legend text. Wide tracking earns the small size. */
  overline: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
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
 * Elevation for cards that sit above the page. Offset plus blur - a shadow
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
   * nowhere else - a glow on every card is a blur on every card.
   */
  glow: {
    shadowColor: palette.v500,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.42,
    shadowRadius: 18,
    elevation: 10,
  },
  accentGlow: {
    shadowColor: palette.l500,
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
 * 180 is not a decision a user can perceive - it is the same drift `spacing`
 * exists to stop, so this is the same answer.
 *
 * Named by the job, not by the number, because the number is what drifts.
 */
export const motion = {
  /**
   * `fast` answers a finger that is already there: by the time a press-in
   * animation plays, the thumb has arrived and the only job left is to admit
   * it. `base` is the default for anything appearing or moving on its own.
   * `slow` is for something large enough that its travel is informative -
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
     * tier must be interruptible - it is the one tier long enough that a user
     * can arrive mid-animation.
     */
    ambient: 1100,
  },

  /**
   * Three springs, each with a reason to exist.
   *
   * `press` is the release overshoot on a tapped surface - stiff and tightly
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
