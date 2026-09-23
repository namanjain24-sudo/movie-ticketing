import type { MovieDetail, MovieSummary } from '@app/shared';
import { relatedTo } from '../similar-movies-rail';

function film(id: string, genres: string[]): MovieSummary {
  return {
    id,
    slug: id,
    title: id,
    posterUrl: '',
    durationMins: 100,
    certification: 'UA',
    languages: ['Hindi'],
    genres,
    releaseDate: '2026-01-01T00:00:00.000Z',
    rating: { average: null, count: 0 },
    isNowShowing: true,
  };
}

function detail(id: string, genres: string[]): MovieDetail {
  return {
    ...film(id, genres),
    synopsis: '',
    backdropUrl: null,
    formats: ['TWO_D'],
    ratingBreakdown: [],
  };
}

describe('relatedTo', () => {
  const current = detail('current', ['Action', 'Thriller']);

  it('excludes the film itself even when genres overlap', () => {
    const all = [current, film('other', ['Action'])];
    expect(relatedTo(current, all).map((m) => m.id)).toEqual(['other']);
  });

  it('excludes films that share no genre', () => {
    const all = [film('comedy', ['Comedy']), film('action', ['Action'])];
    expect(relatedTo(current, all).map((m) => m.id)).toEqual(['action']);
  });

  it('ranks films with more shared genres first', () => {
    const all = [film('one-match', ['Action']), film('two-match', ['Action', 'Thriller'])];
    expect(relatedTo(current, all).map((m) => m.id)).toEqual(['two-match', 'one-match']);
  });

  it('caps the list at ten films', () => {
    const all = Array.from({ length: 15 }, (_, i) => film(`m${i}`, ['Action']));
    expect(relatedTo(current, all)).toHaveLength(10);
  });

  it('returns nothing when no other film shares a genre', () => {
    expect(relatedTo(current, [film('unrelated', ['Documentary'])])).toEqual([]);
  });
});
