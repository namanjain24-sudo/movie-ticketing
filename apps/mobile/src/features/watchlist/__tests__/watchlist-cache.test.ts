import type { MovieSummary } from '@app/shared';
import { withSaved, withoutSaved } from '../watchlist-cache';

function film(id: string): MovieSummary {
  return {
    id,
    slug: `film-${id}`,
    title: `Film ${id}`,
    posterUrl: 'https://example.test/p.jpg',
    durationMins: 120,
    certification: 'UA',
    languages: ['Hindi'],
    genres: ['Drama'],
    releaseDate: '2026-01-01T00:00:00.000Z',
    rating: { average: null, count: 0 },
  };
}

describe('watchlist cache edits', () => {
  it('puts a newly saved film first', () => {
    expect(withSaved([film('a'), film('b')], film('c')).map((m) => m.id)).toEqual(['c', 'a', 'b']);
  });

  it('starts a list from nothing', () => {
    expect(withSaved(undefined, film('a')).map((m) => m.id)).toEqual(['a']);
  });

  it('never doubles a film that is already saved, and moves it to the front', () => {
    expect(withSaved([film('a'), film('b')], film('b')).map((m) => m.id)).toEqual(['b', 'a']);
  });

  it('removes only the named film', () => {
    expect(withoutSaved([film('a'), film('b')], 'a').map((m) => m.id)).toEqual(['b']);
  });

  it('tolerates removing a film that is not there, or a list that is not loaded', () => {
    expect(withoutSaved([film('a')], 'zzz').map((m) => m.id)).toEqual(['a']);
    expect(withoutSaved(undefined, 'a')).toEqual([]);
  });

  it('does not mutate the list it was given', () => {
    const original = [film('a')];
    withSaved(original, film('b'));
    withoutSaved(original, 'a');
    expect(original.map((m) => m.id)).toEqual(['a']);
  });
});
