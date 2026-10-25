import type { CinemaDirectoryEntry } from '@app/shared';
import { withoutSavedCinema, withSavedCinema } from '../favorite-cinemas-cache';

function cinema(id: string): CinemaDirectoryEntry {
  return {
    id,
    kind: 'CINEMA' as const,
    slug: `cinema-${id}`,
    name: `Cinema ${id}`,
    brand: 'PVR',
    city: 'Mumbai',
    address: '1 Test Road',
    latitude: 19.0,
    longitude: 72.8,
    phone: null,
    amenities: [],
    screenCount: 4,
    nowShowingCount: 2,
    fromPriceMinor: 20_000,
    distanceKm: null,
  };
}

describe('favorite-cinemas cache edits', () => {
  it('puts a newly saved cinema first', () => {
    expect(withSavedCinema([cinema('a'), cinema('b')], cinema('c')).map((c) => c.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('starts a list from nothing', () => {
    expect(withSavedCinema(undefined, cinema('a')).map((c) => c.id)).toEqual(['a']);
  });

  it('never doubles a cinema that is already saved, and moves it to the front', () => {
    expect(withSavedCinema([cinema('a'), cinema('b')], cinema('b')).map((c) => c.id)).toEqual([
      'b',
      'a',
    ]);
  });

  it('removes only the named cinema', () => {
    expect(withoutSavedCinema([cinema('a'), cinema('b')], 'a').map((c) => c.id)).toEqual(['b']);
  });

  it('tolerates removing a cinema that is not there, or a list that is not loaded', () => {
    expect(withoutSavedCinema([cinema('a')], 'zzz').map((c) => c.id)).toEqual(['a']);
    expect(withoutSavedCinema(undefined, 'a')).toEqual([]);
  });

  it('does not mutate the list it was given', () => {
    const original = [cinema('a')];
    withSavedCinema(original, cinema('b'));
    withoutSavedCinema(original, 'a');
    expect(original.map((c) => c.id)).toEqual(['a']);
  });
});
