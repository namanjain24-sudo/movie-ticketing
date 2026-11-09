import { FONT_FAMILY } from './tokens';

/**
 * The font files, keyed by the family name each one is registered under.
 *
 * Separate from `tokens.ts` on purpose. The names are design tokens and
 * belong next to the type scale that uses them; these four `require` calls
 * are binary assets, and a unit test that imports a colour should not have to
 * resolve them.
 *
 * The keys are not free-form. They are the exact strings `typography` asks
 * for, taken from the same constant, so a renamed face cannot be registered
 * under one name and requested under another.
 */
export const fontAssets = {
  [FONT_FAMILY.regular]: require('../../assets/fonts/PlusJakartaSans-Regular.ttf'),
  [FONT_FAMILY.semibold]: require('../../assets/fonts/PlusJakartaSans-SemiBold.ttf'),
  [FONT_FAMILY.bold]: require('../../assets/fonts/PlusJakartaSans-Bold.ttf'),
  [FONT_FAMILY.extrabold]: require('../../assets/fonts/PlusJakartaSans-ExtraBold.ttf'),
} as const;
