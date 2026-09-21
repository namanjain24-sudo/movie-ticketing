import type { AvailabilityBand } from '@app/shared';
import type { Colors } from '../../theme';

/**
 * The API deliberately sends a band rather than a seat count, so the wording
 * here stays vague too. Promising "4 left" from a number that was true one
 * request ago is how a booking flow starts lying to people.
 */
export const AVAILABILITY_LABELS: Record<AvailabilityBand, string> = {
  PLENTY: 'Available',
  FILLING: 'Filling fast',
  ALMOST_FULL: 'Almost full',
  SOLD_OUT: 'Sold out',
};

/** One three-step scale, used identically on showtime chips and the legend. */
export function availabilityColor(band: AvailabilityBand, colors: Colors): string {
  switch (band) {
    case 'PLENTY':
      return colors.success;
    case 'FILLING':
      return colors.warning;
    case 'ALMOST_FULL':
      return colors.primary;
    default:
      // Sold out is never coloured. It is simply recessive.
      return colors.textMuted;
  }
}

export function isBookable(band: AvailabilityBand): boolean {
  return band !== 'SOLD_OUT';
}
