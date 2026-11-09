/**
 * Distance, in one place, because the app and the server have to agree.
 *
 * This lived in the API, which was fine while only the API needed it. The
 * ticket screen now works out when to leave for a cinema, which means the
 * client measures distance too - and a second copy of a formula is how a list
 * sorted by distance on the server ends up disagreeing with the distance the
 * app just quoted for the same two points.
 */

/** Mean Earth radius in kilometres, the figure the haversine formula wants. */
const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export type Coordinate = { lat: number; lng: number };

/**
 * Great-circle distance in kilometres.
 *
 * Haversine rather than the flat-Earth approximation: the approximation is
 * fine within a city and wrong by tens of kilometres once the list spans
 * Mumbai to Kolkata, which this one does.
 */
export function distanceKm(from: Coordinate, to: Coordinate): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * How long to allow to get somewhere, in minutes.
 *
 * A single number for city traffic rather than a routing engine, which is why
 * nothing in the product quotes it as an ETA: it decides what to offer and
 * when to remind somebody, and says nothing. Three minutes a kilometre is
 * about 20km/h, which is what an Indian city actually averages door to door,
 * plus ten to park and find the screen.
 *
 * Null distance means there is no position to measure from, so there is no
 * travel claim to make and the allowance is nothing.
 */
export const MINUTES_PER_KM = 3;
export const ARRIVAL_BUFFER_MINUTES = 10;

export function travelAllowanceMinutes(distance: number | null): number {
  if (distance === null) return 0;
  return Math.round(distance * MINUTES_PER_KM) + ARRIVAL_BUFFER_MINUTES;
}
