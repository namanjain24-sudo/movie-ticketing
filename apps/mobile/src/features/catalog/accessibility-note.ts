import {
  ACCESSIBILITY_LABELS,
  ACCESSIBILITY_LABELS_IN_SENTENCE,
  type AccessibilityFeature,
} from '@app/shared';
import { joinWords } from '../../lib/format';

export interface AccessibilityNote {
  /** What this screening offers, as a clause: "Audio description and captions". */
  offered: string;
  /** How to receive it, when something has to be installed first. */
  delivery: string | null;
}

/**
 * What to say about a screening's accessibility on the page somebody books on.
 *
 * The Ministry of Information and Broadcasting's advisory of July 2026 — after
 * a Delhi High Court order in February, which found that a disabled person
 * could not book a ticket on these platforms independently — requires a
 * ticketing platform to say before a booking is completed whether a film
 * carries audio description, closed captions or Indian Sign Language, and to
 * name the application where an external one provides them.
 *
 * That second half is the part that decides whether any of it is usable.
 * Audio description in a multiplex here is not played to the auditorium: PVR's
 * accessible screenings run it through XL Cinema, which listens to the room,
 * finds its place in the film and plays the narration to the viewer's own
 * headphones. Somebody who is told only that a screening is "described" has
 * been given a fact and not a way in — they arrive without the app, without
 * headphones, and the screening is no more accessible than any other.
 *
 * Returns null when there is nothing to disclose. An empty list means nothing
 * is claimed, which is not the same as claiming none, so the screen says
 * nothing rather than printing a reassuring absence.
 */
export function accessibilityNote(
  features: AccessibilityFeature[],
  via: string | null,
): AccessibilityNote | null {
  if (features.length === 0) return null;

  const offered = joinWords(
    // Said in full: a screen reader that meets "AD" reads the letters, and a
    // row of initials is no use to the person most likely to be listening to
    // this one. Only the opening term keeps its capital, and Indian Sign
    // Language keeps its own wherever it lands.
    features.map((feature, index) =>
      index === 0 ? ACCESSIBILITY_LABELS[feature] : ACCESSIBILITY_LABELS_IN_SENTENCE[feature],
    ),
  );

  if (!via) return { offered, delivery: null };

  // Headphones only where there is something to listen to. An interpreter
  // feed is watched, and telling somebody to bring headphones for it is the
  // kind of detail that makes the rest of the advice look guessed at.
  const listening = features.includes('AUDIO_DESCRIPTION');
  return {
    offered,
    delivery: listening
      ? `Plays through ${via} on your own phone, so bring headphones and install it before you arrive.`
      : `Runs through ${via} on your own phone — install it before you arrive.`,
  };
}
