import type { Coords } from './use-location';

/**
 * Padding around the fitted region, as a fraction of the span it is fitting.
 * Without it, the outermost pins sit exactly on the edge of the map and read as
 * cut off rather than as the extremes of the set.
 */
const FIT_PADDING = 0.35;

/** Degrees of latitude to show when there is only one thing to look at. */
const SINGLE_PIN_SPAN = 0.012;

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

/**
 * The region that contains every point, with room to breathe.
 *
 * Computed rather than arrived at by animating with `fitToCoordinates`, because
 * the initial region has to be right on the very first frame — a map that opens
 * on the middle of the Indian Ocean and then slides to Mumbai looks broken even
 * though it ends up correct.
 */
export function regionFor(points: Coords[]): Region | null {
  if (points.length === 0) return null;

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    // A single pin has a span of zero, which is not a region a map can show.
    latitudeDelta: Math.max(SINGLE_PIN_SPAN, (maxLat - minLat) * (1 + FIT_PADDING)),
    longitudeDelta: Math.max(SINGLE_PIN_SPAN, (maxLng - minLng) * (1 + FIT_PADDING)),
  };
}
