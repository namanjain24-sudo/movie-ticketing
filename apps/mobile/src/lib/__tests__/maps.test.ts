import { directionsUrl, formatDistance, mapsUrl } from '../maps';

const REGAL = { latitude: 18.9227, longitude: 72.8329, label: 'Regal Cinema, Colaba' };

describe('mapsUrl', () => {
  it('builds a universal place link from the coordinate', () => {
    expect(mapsUrl(REGAL)).toBe(
      'https://www.google.com/maps/search/?api=1&query=18.9227%2C72.8329',
    );
  });

  it('builds a directions link with the destination encoded', () => {
    expect(directionsUrl(REGAL)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=18.9227%2C72.8329',
    );
  });
});

describe('formatDistance', () => {
  it('uses metres below a kilometre, because 0.6 km is not how anyone says it', () => {
    expect(formatDistance(0.64)).toBe('640 m');
    expect(formatDistance(0.999)).toBe('999 m');
  });

  it('keeps one decimal while it still means something', () => {
    expect(formatDistance(1.24)).toBe('1.2 km');
    expect(formatDistance(9.9)).toBe('9.9 km');
  });

  // A tenth of a kilometre at 600 km away is noise dressed as precision.
  it('drops the decimal once the number is large', () => {
    expect(formatDistance(10)).toBe('10 km');
    expect(formatDistance(612.4)).toBe('612 km');
  });

  it('has nothing to say when there is no distance', () => {
    expect(formatDistance(null)).toBeNull();
  });
});
