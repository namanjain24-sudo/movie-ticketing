import { regionFor } from '../region';

const LOWER_PAREL = { lat: 19.0064, lng: 72.8258 };
const COLABA = { lat: 18.9227, lng: 72.8329 };
const KOLKATA = { lat: 22.5392, lng: 88.3665 };

describe('regionFor', () => {
  it('has nothing to show for an empty set', () => {
    expect(regionFor([])).toBeNull();
  });

  // A span of zero is not a region a map can render, so a lone pin gets a
  // fixed neighbourhood-sized window around it instead.
  it('gives a single point a usable span rather than a zero one', () => {
    const region = regionFor([LOWER_PAREL]);
    expect(region).not.toBeNull();
    expect(region!.latitude).toBeCloseTo(LOWER_PAREL.lat, 6);
    expect(region!.longitude).toBeCloseTo(LOWER_PAREL.lng, 6);
    expect(region!.latitudeDelta).toBeGreaterThan(0);
    expect(region!.longitudeDelta).toBeGreaterThan(0);
  });

  it('centres on the midpoint of the extremes', () => {
    const region = regionFor([LOWER_PAREL, COLABA])!;
    expect(region.latitude).toBeCloseTo((LOWER_PAREL.lat + COLABA.lat) / 2, 6);
    expect(region.longitude).toBeCloseTo((LOWER_PAREL.lng + COLABA.lng) / 2, 6);
  });

  it('leaves room around the outermost pins', () => {
    const span = Math.abs(KOLKATA.lng - COLABA.lng);
    expect(regionFor([COLABA, KOLKATA])!.longitudeDelta).toBeGreaterThan(span);
  });

  it('ignores the order the points arrive in', () => {
    expect(regionFor([COLABA, KOLKATA, LOWER_PAREL])).toEqual(
      regionFor([KOLKATA, LOWER_PAREL, COLABA]),
    );
  });

  it('contains every point it was given', () => {
    const points = [COLABA, KOLKATA, LOWER_PAREL];
    const region = regionFor(points)!;
    for (const point of points) {
      expect(Math.abs(point.lat - region.latitude)).toBeLessThanOrEqual(region.latitudeDelta / 2);
      expect(Math.abs(point.lng - region.longitude)).toBeLessThanOrEqual(region.longitudeDelta / 2);
    }
  });
});
