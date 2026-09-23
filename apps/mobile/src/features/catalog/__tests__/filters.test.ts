import type { MovieSummary } from '@app/shared';
import { byGenre, byLanguage, genresIn, languagesIn } from '../genre-filter';

function film(id: string, languages: string[], genres: string[]): MovieSummary {
  return {
    id,
    slug: id,
    title: id,
    posterUrl: '',
    durationMins: 100,
    certification: 'UA',
    languages,
    genres,
    releaseDate: '2026-01-01T00:00:00.000Z',
    rating: { average: null, count: 0 },
    isNowShowing: true,
  };
}

const LIST = [
  film('a', ['Hindi', 'Tamil'], ['Action']),
  film('b', ['Hindi'], ['Drama', 'Action']),
  film('c', ['English'], ['Drama']),
];

describe('catalogue filters', () => {
  it('lists languages most common first, ties alphabetical', () => {
    expect(languagesIn(LIST)).toEqual(['Hindi', 'English', 'Tamil']);
  });

  it('lists only languages that are actually present', () => {
    expect(languagesIn([])).toEqual([]);
  });

  it('narrows by language, including films that offer several', () => {
    expect(byLanguage(LIST, 'Tamil').map((m) => m.id)).toEqual(['a']);
    expect(byLanguage(LIST, 'Hindi').map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('returns everything when no language is chosen', () => {
    expect(byLanguage(LIST, undefined)).toHaveLength(3);
  });

  it('composes with the genre filter', () => {
    const both = byLanguage(byGenre(LIST, 'Drama'), 'Hindi');
    expect(both.map((m) => m.id)).toEqual(['b']);
  });

  it('genre counts still work', () => {
    expect(genresIn(LIST)).toEqual(['Action', 'Drama']);
  });
});
