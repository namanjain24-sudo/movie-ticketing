import type { AccessibilityFeature } from '@app/shared';
import { accessibilityNote } from '../accessibility-note';

/**
 * The null case is worth asserting on its own and worth getting out of the
 * way everywhere else; a `!` on every line would hide the one place it
 * matters.
 */
function note(features: AccessibilityFeature[], via: string | null) {
  const result = accessibilityNote(features, via);
  if (!result) throw new Error('expected something to disclose');
  return result;
}

describe('accessibilityNote', () => {
  it('says nothing when nothing is claimed', () => {
    // An empty list is "nothing is claimed", not "this screening has none",
    // so a reassuring absence would be the one dishonest thing to print.
    expect(accessibilityNote([], null)).toBeNull();
    expect(accessibilityNote([], 'XL Cinema')).toBeNull();
  });

  it('names one feature in full', () => {
    expect(note(['CLOSED_CAPTIONS'], null)).toEqual({
      offered: 'Closed captions',
      delivery: null,
    });
  });

  it('reads as a clause once there are several', () => {
    expect(
      note(['AUDIO_DESCRIPTION', 'CLOSED_CAPTIONS', 'INDIAN_SIGN_LANGUAGE'], null).offered,
    ).toBe('Audio description, closed captions and Indian Sign Language');
  });

  it('never abbreviates, because the listener hears the letters', () => {
    const { offered } = note(['AUDIO_DESCRIPTION'], null);

    expect(offered).toBe('Audio description');
    expect(offered).not.toMatch(/\bAD\b/);
  });

  it('asks for headphones when there is a narration to hear', () => {
    expect(note(['AUDIO_DESCRIPTION'], 'XL Cinema').delivery).toBe(
      'Plays through XL Cinema on your own phone, so bring headphones and install it before you arrive.',
    );
  });

  it('does not ask for headphones for an interpreter feed, which is watched', () => {
    const { delivery } = note(['INDIAN_SIGN_LANGUAGE'], 'XL Cinema');

    expect(delivery).toBe(
      'Runs through XL Cinema on your own phone — install it before you arrive.',
    );
    expect(delivery).not.toMatch(/headphones/);
  });

  it('names the app, because a feature nobody can receive is not a feature', () => {
    expect(note(['AUDIO_DESCRIPTION'], 'XL Cinema').delivery).toContain('XL Cinema');
  });

  it('leaves out the delivery line when there is nothing to install', () => {
    // Captions are on the screen. Telling somebody to install something for
    // them would be advice to go and not find it.
    expect(note(['CLOSED_CAPTIONS'], null).delivery).toBeNull();
  });

  it('treats an empty app name as nothing to install, not as an app called ""', () => {
    expect(note(['AUDIO_DESCRIPTION'], '').delivery).toBeNull();
  });
});
